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

  const where = role === "CLIENT" ? { companyId: companyId! } : {};

  const [counts, recentIncidents] = await Promise.all([
    prisma.incident.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.incident.findMany({
      where: {
        ...where,
        ...(role === "AGENT" ? { assignedToId: session.user.id } : {}),
      },
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
              <p className="text-sm text-gray-500 truncate">Total</p>
            </div>
          </div>
        </Link>

        {/* Una tarjeta por estado */}
        {statusOrder.map((status) => {
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
                  <p className="text-sm text-gray-500 truncate">
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
              const status = STATUS_CONFIG[incident.status as keyof typeof STATUS_CONFIG];
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
                      {status && (
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
                            status.className
                          )}
                        >
                          {status.label}
                        </span>
                      )}
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
