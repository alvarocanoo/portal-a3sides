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
import { formatDate } from "@/lib/constants";

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

  const [counts, recentIncidents] = await Promise.all([
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
                  <span className="text-xs text-gray-400 ml-4 shrink-0">
                    {formatDate(incident.updatedAt)}
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
