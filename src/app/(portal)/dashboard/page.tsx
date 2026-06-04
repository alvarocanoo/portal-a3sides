import { requireAuth } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db";
import {
  Ticket,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Hourglass,
  ExternalLink,
  CheckCheck,
  Activity,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  IncidentStatus,
  STATUS_CONFIG,
  statusClass,
  statusLabel,
  statusLabelFor,
  statusClassFor,
} from "@/lib/incident-states";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/constants";

// Iconos por estado — el resto (label, color, filtro) viene de STATUS_CONFIG.
const STATUS_ICONS: Record<IncidentStatus, LucideIcon> = {
  [IncidentStatus.OPEN]: AlertTriangle,
  [IncidentStatus.IN_PROGRESS]: Clock,
  [IncidentStatus.WAITING_CLIENT]: Hourglass,
  [IncidentStatus.WAITING_THIRD_PARTY]: ExternalLink,
  [IncidentStatus.RESOLVED]: CheckCircle2,
  [IncidentStatus.CLOSED]: CheckCheck,
};

export default async function DashboardPage() {
  const session = await requireAuth();
  const { role, companyId } = session.user;

  // Scope unificado por rol — cards y lista usan EL MISMO filtro para que
  // los conteos coincidan con lo que el usuario ve abajo.
  //   CLIENT → su empresa
  //   AGENT  → sus incidencias asignadas (consistente con "Tus incidencias
  //            asignadas" y con la lista de abajo).
  //   ADMIN  → todo
  const where =
    role === "CLIENT"
      ? { companyId: companyId! }
      : role === "AGENT"
        ? { assignedToId: session.user.id }
        : {};

  const [counts, recentIncidents, failedNotifications24h] = await Promise.all([
    prisma.incident.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.incident.findMany({
      where,
      include: {
        company: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    // §2.1: visibilidad de SMTP fallidos. Solo ADMIN — para AGENT/CLIENT
    // no aporta nada. Cuando es 0 no se renderiza nada (zero-state
    // silencioso): el banner aparece SOLO si hay problema, principio
    // "que el problema se vea solo".
    role === "ADMIN"
      ? prisma.notificationAttempt.count({
          where: {
            status: "failed",
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        })
      : Promise.resolve(0),
  ]);

  // Construir mapa de conteos por estado + total (suma de todos)
  const countByStatus: Record<string, number> = {};
  let total = 0;
  for (const c of counts) {
    countByStatus[c.status] = c._count._all;
    total += c._count._all;
  }

  // Una tarjeta "Total" + una por cada estado, en el orden del enum.
  const statusOrder: IncidentStatus[] = Object.keys(STATUS_CONFIG) as IncidentStatus[];

  // ── Métricas de tiempo SOLO para AGENT/ADMIN ────────────────────────
  // CLIENT no ve esta sección (igual que no ve prioridad ni SLA chips).
  // 4 métricas con el mismo `where` que las tarjetas de conteo:
  //   1. Tiempo medio de 1ª respuesta (incidencias con firstResponseAt).
  //   2. Tiempo medio de resolución (incidencias con resolvedAt).
  //   3. Sin 1ª respuesta (backlog activo sin respuesta del staff).
  //   4. Tasa de resolución = (RESOLVED + CLOSED) / total.
  //
  // Defensa anti-NaN/Infinity en todos los cálculos:
  //   - Si no hay filas para promediar → null → la tarjeta muestra "—".
  //   - Si total = 0 → tasa null → "—".
  //   - 0% válido (información real), solo "—" cuando NO hay datos.
  const staffMetrics =
    role === "CLIENT"
      ? null
      : await (async () => {
          const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [respRows, resRows, noResp, noRespOver24h, doneCount] =
            await Promise.all([
              prisma.incident.findMany({
                where: { ...where, firstResponseAt: { not: null } },
                select: { createdAt: true, firstResponseAt: true },
              }),
              prisma.incident.findMany({
                where: { ...where, resolvedAt: { not: null } },
                select: { createdAt: true, resolvedAt: true },
              }),
              prisma.incident.count({
                where: {
                  ...where,
                  firstResponseAt: null,
                  status: { notIn: ["RESOLVED", "CLOSED"] },
                },
              }),
              prisma.incident.count({
                where: {
                  ...where,
                  firstResponseAt: null,
                  status: { notIn: ["RESOLVED", "CLOSED"] },
                  createdAt: { lt: TWENTY_FOUR_HOURS_AGO },
                },
              }),
              prisma.incident.count({
                where: { ...where, status: { in: ["RESOLVED", "CLOSED"] } },
              }),
            ]);

          const avgFirstResp =
            respRows.length === 0
              ? null
              : respRows.reduce(
                  (s, r) =>
                    s + (r.firstResponseAt!.getTime() - r.createdAt.getTime()),
                  0
                ) / respRows.length;

          const avgResolution =
            resRows.length === 0
              ? null
              : resRows.reduce(
                  (s, r) =>
                    s + (r.resolvedAt!.getTime() - r.createdAt.getTime()),
                  0
                ) / resRows.length;

          // Tasa: null si total=0 (muestra "—") para no mostrar "0%
          // engañoso" cuando no hay incidencias en absoluto. Con total>0,
          // 0% es información válida (cero resueltas de N totales).
          const resolutionRate = total === 0 ? null : doneCount / total;

          return {
            avgFirstResp,
            avgResolution,
            noResp,
            noRespOver24h,
            resolutionRate,
          };
        })();

  // ── Tarjetas agrupadas para CLIENT (4 en vez de 6) ──────────────────
  // El cliente ve 4 etiquetas (Abierta, En proceso, Esperando tu respuesta,
  // Cerrada). Sumamos en memoria los pares correspondientes y enlazamos a
  // los pseudo-valores que la página de lista expande con
  // `expandClientStatusFilter`.
  const isClient = role === "CLIENT";
  const CLIENT_DASHBOARD_CARDS: {
    label: string;
    icon: LucideIcon;
    className: string;
    count: number;
    href: string;
  }[] = isClient
    ? [
        {
          label: "Abierta",
          icon: STATUS_ICONS[IncidentStatus.OPEN],
          className: statusClassFor(role, IncidentStatus.OPEN),
          count: countByStatus[IncidentStatus.OPEN] ?? 0,
          href: `/incidencias?status=${IncidentStatus.OPEN}`,
        },
        {
          label: "En proceso",
          icon: STATUS_ICONS[IncidentStatus.IN_PROGRESS],
          className: statusClassFor(role, IncidentStatus.IN_PROGRESS),
          count:
            (countByStatus[IncidentStatus.IN_PROGRESS] ?? 0) +
            (countByStatus[IncidentStatus.WAITING_THIRD_PARTY] ?? 0),
          href: "/incidencias?status=IN_PROCESS",
        },
        {
          // Variante CORTA solo para esta tarjeta del dashboard (cabe sin
          // truncar). En la lista y el detalle, donde hay más espacio, el
          // CLIENT sigue viendo "Esperando tu respuesta" vía
          // statusLabelFor() — esto es presentación contextual del MISMO
          // estado interno WAITING_CLIENT.
          label: "Pendiente de ti",
          icon: STATUS_ICONS[IncidentStatus.WAITING_CLIENT],
          className: statusClassFor(role, IncidentStatus.WAITING_CLIENT),
          count: countByStatus[IncidentStatus.WAITING_CLIENT] ?? 0,
          href: `/incidencias?status=${IncidentStatus.WAITING_CLIENT}`,
        },
        {
          label: "Cerrada",
          icon: STATUS_ICONS[IncidentStatus.CLOSED],
          className: statusClassFor(role, IncidentStatus.CLOSED),
          count:
            (countByStatus[IncidentStatus.RESOLVED] ?? 0) +
            (countByStatus[IncidentStatus.CLOSED] ?? 0),
          href: "/incidencias?status=CLOSED_GROUP",
        },
      ]
    : [];

  const greeting =
    role === "CLIENT"
      ? "Bienvenido al portal de soporte"
      : role === "AGENT"
        ? "Tus incidencias asignadas"
        : "Panel de administración";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{greeting}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-4 mb-8">
        {/* Total — siempre primero, con color de marca */}
        <Link
          href="/incidencias"
          className="bg-white rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-300 hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md text-[#275d6b] bg-[#275d6b]/10">
              <Ticket className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-gray-900">{total}</p>
              <p className="text-sm text-gray-500 leading-tight">Total</p>
            </div>
          </div>
        </Link>

        {/* Tarjetas por estado.
            CLIENT: 4 tarjetas agrupadas (CLIENT_DASHBOARD_CARDS).
            AGENT/ADMIN: las 6 reales del enum, sin cambios. */}
        {isClient
          ? CLIENT_DASHBOARD_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="bg-white rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-300 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-md", card.className)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-gray-900">
                        {card.count}
                      </p>
                      <p className="text-sm text-gray-500 leading-tight">
                        {card.label}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })
          : statusOrder.map((status) => {
              const Icon = STATUS_ICONS[status];
              return (
                <Link
                  key={status}
                  href={`/incidencias?status=${status}`}
                  className="bg-white rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-300 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-md", statusClass(status))}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-gray-900">
                        {countByStatus[status] ?? 0}
                      </p>
                      <p className="text-sm text-gray-500 leading-tight">
                        {statusLabel(status)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>

      {/* ── Banner notificaciones fallidas — SOLO ADMIN ───────────────
          Zero-state silencioso: si no hay fallos en últimas 24h, NADA
          se renderiza. Solo aparece cuando hay un problema real que
          el admin debe atender (típicamente: caída SMTP). */}
      {role === "ADMIN" && failedNotifications24h > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-900">
              {failedNotifications24h} notificaci
              {failedNotifications24h === 1 ? "ón" : "ones"} no se{" "}
              {failedNotifications24h === 1 ? "ha" : "han"} podido enviar en las
              últimas 24 horas.
            </p>
            <p className="text-xs text-red-700 mt-1">
              Probable problema de SMTP. Revisa la configuración (SMTP_HOST,
              SMTP_USER, SMTP_PASS) y los logs del servidor. Los clientes y
              agentes destinatarios NO han recibido el aviso.
            </p>
          </div>
        </div>
      )}

      {/* ── Métricas de tiempo — SOLO AGENT/ADMIN ──────────────────────
          El CLIENT no ve nada de esta sección. staffMetrics es null para
          CLIENT, así que el bloque no se renderiza. Los valores null
          internos (cuando no hay datos para una métrica concreta) se
          renderizan como "—", nunca como NaN ni Infinity. */}
      {staffMetrics && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Tiempos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1) Tiempo medio de primera respuesta */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md text-[#275d6b] bg-[#275d6b]/10 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-gray-900">
                    {staffMetrics.avgFirstResp !== null
                      ? formatDuration(staffMetrics.avgFirstResp)
                      : "—"}
                  </p>
                  <p className="text-sm text-gray-500 leading-tight">
                    Tiempo medio 1ª respuesta
                  </p>
                </div>
              </div>
            </div>

            {/* 2) Tiempo medio de resolución */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md text-[#275d6b] bg-[#275d6b]/10 shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-gray-900">
                    {staffMetrics.avgResolution !== null
                      ? formatDuration(staffMetrics.avgResolution)
                      : "—"}
                  </p>
                  <p className="text-sm text-gray-500 leading-tight">
                    Tiempo medio resolución
                  </p>
                </div>
              </div>
            </div>

            {/* 3) Sin 1ª respuesta — backlog. Si hay alguna que lleva
                 > 24h, todo el bloque se resalta en ámbar (aviso de
                 atención requerida) en vez de gris. */}
            <div
              className={cn(
                "rounded-lg border p-5",
                staffMetrics.noRespOver24h > 0
                  ? "bg-amber-50 border-amber-200"
                  : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-md shrink-0",
                    staffMetrics.noRespOver24h > 0
                      ? "text-amber-700 bg-amber-100"
                      : "text-[#275d6b] bg-[#275d6b]/10"
                  )}
                >
                  <Hourglass className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-gray-900">
                    {staffMetrics.noResp}
                  </p>
                  <p className="text-sm text-gray-500 leading-tight">
                    Sin 1ª respuesta
                    {staffMetrics.noRespOver24h > 0 && (
                      <span className="block text-xs text-amber-700 mt-0.5">
                        {staffMetrics.noRespOver24h} lleva
                        {staffMetrics.noRespOver24h === 1 ? "" : "n"} {">"}24h
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 4) Tasa de resolución — % o "—" si total=0. */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md text-[#275d6b] bg-[#275d6b]/10 shrink-0">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-gray-900">
                    {staffMetrics.resolutionRate !== null
                      ? `${Math.round(staffMetrics.resolutionRate * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-sm text-gray-500 leading-tight">
                    Tasa de resolución
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {role === "AGENT" ? "Asignadas a ti" : "Incidencias recientes"}
          </h2>
          <Link
            href="/incidencias"
            className="text-sm text-[#275d6b] hover:text-[#1f4e5b] font-medium"
          >
            Ver todas
          </Link>
        </div>

        {recentIncidents.length === 0 ? (
          <div className="p-10 text-center">
            {role === "CLIENT" ? (
              <div>
                <Ticket className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-1">
                  No tienes incidencias abiertas
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  Crea tu primera incidencia para recibir soporte
                </p>
                <Link
                  href="/incidencias/nueva"
                  className="inline-block px-4 py-2 bg-[#275d6b] text-white text-sm font-medium rounded-md hover:bg-[#1f4e5b] transition-colors"
                >
                  Crear incidencia
                </Link>
              </div>
            ) : (
              <div>
                <Ticket className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No hay incidencias recientes</p>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentIncidents.map((incident) => {
              const statusBadgeLabel = statusLabelFor(role, incident.status);
              const statusBadgeClass = statusClassFor(role, incident.status);
              return (
                <Link
                  key={incident.id}
                  href={`/incidencias/${incident.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">
                        {incident.reference}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
                          statusBadgeClass
                        )}
                      >
                        {statusBadgeLabel}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate mt-0.5">
                      {incident.subject}
                    </p>
                  </div>
                  {/* Fecha relativa para escaneo rápido; absoluta en title. */}
                  <span
                    className="text-xs text-gray-400 ml-4 shrink-0"
                    title={formatDateTime(incident.updatedAt)}
                  >
                    {formatRelative(incident.updatedAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
