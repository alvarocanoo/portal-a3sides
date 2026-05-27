import { requireAuth } from "@/lib/auth/helpers";
import { IncidentService } from "@/services/incident.service";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Ticket } from "lucide-react";
import { IncidentFilters } from "@/components/incidents/incident-filters";
import { STATUS_CONFIG } from "@/lib/incident-states";
import { PRIORITY_CONFIG, formatDate } from "@/lib/constants";

export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;

  const result = await IncidentService.list({
    page: parseInt(params.page || "1", 10),
    limit: 20,
    status: params.status as never,
    priority: params.priority as never,
    search: params.search,
    role: session.user.role,
    companyId: session.user.companyId ?? undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidencias</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {result.total} incidencia{result.total !== 1 && "s"}
          </p>
        </div>
        {session.user.role === "CLIENT" && (
          <Link
            href="/incidencias/nueva"
            className="px-4 py-2 bg-[#275d6b] text-white text-sm font-medium rounded-md hover:bg-[#1f4e5b] transition-colors"
          >
            Nueva incidencia
          </Link>
        )}
      </div>

      <IncidentFilters
        currentStatus={params.status}
        currentPriority={params.priority}
        currentSearch={params.search}
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">No hay incidencias</p>
            <p className="text-sm text-gray-400">
              {params.status || params.priority || params.search
                ? "Prueba a cambiar los filtros"
                : "Todavía no se ha creado ninguna incidencia"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Referencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asunto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prioridad
                </th>
                {session.user.role !== "CLIENT" && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Asignado
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.items.map((incident) => {
                const status = STATUS_CONFIG[incident.status];
                const priority = PRIORITY_CONFIG[incident.priority];
                return (
                  <tr
                    key={incident.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/incidencias/${incident.id}`}
                        className="text-sm font-mono text-[#275d6b] hover:underline"
                      >
                        {incident.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        href={`/incidencias/${incident.id}`}
                        className="text-sm text-gray-900 hover:text-[#275d6b] line-clamp-1"
                      >
                        {incident.subject}
                      </Link>
                      {incident.category && (
                        <span className="text-xs text-gray-400 block">
                          {incident.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-sm", priority.className)}>
                        {priority.label}
                      </span>
                    </td>
                    {session.user.role !== "CLIENT" && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {incident.company.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {incident.assignedTo
                            ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
                            : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(incident.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {result.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-1">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map(
            (page) => (
              <Link
                key={page}
                href={`/incidencias?page=${page}${params.status ? `&status=${params.status}` : ""}${params.priority ? `&priority=${params.priority}` : ""}${params.search ? `&search=${params.search}` : ""}`}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  page === result.page
                    ? "bg-[#275d6b] text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {page}
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}
