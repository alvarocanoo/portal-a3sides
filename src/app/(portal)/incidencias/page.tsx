import { requireAuth } from "@/lib/auth/helpers";
import { IncidentService } from "@/services/incident.service";
import Link from "next/link";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Abierta", className: "bg-orange-100 text-orange-800" },
  IN_PROGRESS: { label: "En curso", className: "bg-blue-100 text-blue-800" },
  WAITING_CLIENT: {
    label: "Esperando cliente",
    className: "bg-yellow-100 text-yellow-800",
  },
  WAITING_THIRD_PARTY: {
    label: "Esperando tercero",
    className: "bg-purple-100 text-purple-800",
  },
  RESOLVED: { label: "Resuelta", className: "bg-green-100 text-green-800" },
  CLOSED: { label: "Cerrada", className: "bg-gray-100 text-gray-800" },
};

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  LOW: { label: "Baja", className: "text-gray-500" },
  MEDIUM: { label: "Media", className: "text-blue-600" },
  HIGH: { label: "Alta", className: "text-orange-600" },
  CRITICAL: { label: "Crítica", className: "text-red-600 font-semibold" },
};

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
        <h1 className="text-2xl font-bold text-gray-900">Incidencias</h1>
        {session.user.role === "CLIENT" && (
          <Link
            href="/incidencias/nueva"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Nueva incidencia
          </Link>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay incidencias.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Referencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Asunto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Prioridad
                </th>
                {session.user.role !== "CLIENT" && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Empresa
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {result.items.map((incident) => {
                const status = STATUS_LABELS[incident.status];
                const priority = PRIORITY_LABELS[incident.priority];
                return (
                  <tr
                    key={incident.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/incidencias/${incident.id}`}
                        className="text-sm font-mono text-blue-600 hover:underline"
                      >
                        {incident.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/incidencias/${incident.id}`}
                        className="text-sm text-gray-900 hover:text-blue-600"
                      >
                        {incident.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2 py-1 text-xs font-medium rounded-full",
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
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {incident.company.name}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(incident.createdAt).toLocaleDateString("es-ES")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {result.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map(
            (page) => (
              <Link
                key={page}
                href={`/incidencias?page=${page}`}
                className={cn(
                  "px-3 py-1 text-sm rounded-md",
                  page === result.page
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
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
