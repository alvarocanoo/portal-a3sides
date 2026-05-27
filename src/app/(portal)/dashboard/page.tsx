import { requireAuth } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db";
import { Ticket, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Abierta", className: "bg-orange-100 text-orange-800" },
  IN_PROGRESS: { label: "En curso", className: "bg-blue-100 text-blue-800" },
  WAITING_CLIENT: {
    label: "Esp. cliente",
    className: "bg-yellow-100 text-yellow-800",
  },
  WAITING_THIRD_PARTY: {
    label: "Esp. tercero",
    className: "bg-purple-100 text-purple-800",
  },
  RESOLVED: { label: "Resuelta", className: "bg-green-100 text-green-800" },
  CLOSED: { label: "Cerrada", className: "bg-gray-100 text-gray-800" },
};

export default async function DashboardPage() {
  const session = await requireAuth();
  const { role, companyId } = session.user;

  const where = role === "CLIENT" ? { companyId: companyId! } : {};

  const [total, open, inProgress, resolved, recentIncidents] =
    await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.count({ where: { ...where, status: "OPEN" } }),
      prisma.incident.count({
        where: {
          ...where,
          status: {
            in: ["IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY"],
          },
        },
      }),
      prisma.incident.count({
        where: { ...where, status: { in: ["RESOLVED", "CLOSED"] } },
      }),
      prisma.incident.findMany({
        where: {
          ...where,
          ...(role === "AGENT"
            ? { assignedToId: session.user.id }
            : {}),
        },
        include: {
          company: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  const stats = [
    {
      label: "Total",
      value: total,
      icon: Ticket,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Abiertas",
      value: open,
      icon: AlertTriangle,
      color: "text-orange-600 bg-orange-50",
    },
    {
      label: "En curso",
      value: inProgress,
      icon: Clock,
      color: "text-yellow-600 bg-yellow-50",
    },
    {
      label: "Resueltas",
      value: resolved,
      icon: CheckCircle2,
      color: "text-green-600 bg-green-50",
    },
  ];

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
        <p className="text-sm text-gray-500 mt-1">{greeting}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-lg border border-gray-200 p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stat.value}
                  </p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              </div>
            </div>
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
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Ver todas
          </Link>
        </div>

        {recentIncidents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {role === "CLIENT" ? (
              <div>
                <p className="mb-3">No tienes incidencias abiertas.</p>
                <Link
                  href="/incidencias/nueva"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Crear primera incidencia
                </Link>
              </div>
            ) : (
              <p>No hay incidencias recientes.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentIncidents.map((incident) => {
              const status = STATUS_LABELS[incident.status];
              return (
                <Link
                  key={incident.id}
                  href={`/incidencias/${incident.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">
                        {incident.reference}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate mt-0.5">
                      {incident.subject}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 ml-4 shrink-0">
                    {new Date(incident.updatedAt).toLocaleDateString("es-ES")}
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
