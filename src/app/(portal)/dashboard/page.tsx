import { requireAuth } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db";
import { Ticket, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, formatDate } from "@/lib/constants";

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

  const stats = [
    {
      label: "Total",
      value: total,
      icon: Ticket,
      color: "text-[#275d6b] bg-[#275d6b]/10",
      href: "/incidencias",
    },
    {
      label: "Abiertas",
      value: open,
      icon: AlertTriangle,
      color: "text-orange-600 bg-orange-50",
      href: "/incidencias?status=OPEN",
    },
    {
      label: "En curso",
      value: inProgress,
      icon: Clock,
      color: "text-yellow-600 bg-yellow-50",
      href: "/incidencias?status=IN_PROGRESS",
    },
    {
      label: "Resueltas",
      value: resolved,
      icon: CheckCircle2,
      color: "text-green-600 bg-green-50",
      href: "/incidencias?status=RESOLVED",
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
        <p className="text-sm text-gray-500 mt-0.5">{greeting}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-white rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-300 hover:shadow-sm"
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
              const status = STATUS_CONFIG[incident.status];
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
