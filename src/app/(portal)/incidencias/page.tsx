import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/helpers";
import { IncidentService } from "@/services/incident.service";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Ticket } from "lucide-react";
import { IncidentFilters } from "@/components/incidents/incident-filters";
import {
  expandClientStatusFilter,
  expandStaffStatusFilter,
  statusLabelFor,
  statusClassFor,
} from "@/lib/incident-states";
import { PRIORITY_CONFIG, formatDate } from "@/lib/constants";

export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const isClient = session.user.role === "CLIENT";

  // El dropdown de estado emite un valor según rol:
  //   CLIENT → 4 etiquetas agrupadas + ALL (con expandClientStatusFilter)
  //   AGENT/ADMIN → estados reales + ALL (con expandStaffStatusFilter)
  // En AMBOS roles, sin status = "Activas" (oculta RESOLVED/CLOSED).
  // El usuario puede ver cerradas eligiendo "Todas (incluye cerradas)".
  const statusFilter = isClient
    ? expandClientStatusFilter(params.status)
    : expandStaffStatusFilter(params.status);

  // Filtro "Asignadas a mí": SOLO staff. Si un CLIENT mete ?assigned=me a
  // mano en la URL lo ignoramos completamente — su scope sigue siendo su
  // empresa (where.companyId aplicado en el servicio). Doble blindaje:
  // aquí + en el componente de filtros (que tampoco lo emite si isClient).
  const assignedToMe = !isClient && params.assigned === "me";

  const result = await IncidentService.list({
    page: parseInt(params.page || "1", 10),
    limit: 20,
    status: statusFilter,
    // CLIENT no ve prioridad — ignoramos cualquier ?priority= que llegue.
    priority: isClient ? undefined : (params.priority as never),
    search: params.search,
    assignedToId: assignedToMe ? session.user.id : undefined,
    role: session.user.role,
    companyId: session.user.companyId ?? undefined,
    clientOrder: isClient,
    staffOrder: !isClient,
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

      {/* Suspense boundary obligatorio: IncidentFilters usa useSearchParams,
          que en Next.js 15 con App Router puede causar un BUCLE de fetches
          RSC al navegar (sin error de consola, página colgada) cuando el
          árbol tiene también un loading.tsx (segment Suspense del portal
          layout). Darle al filtro su PROPIO boundary rompe esa
          interacción. Ver:
          https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
          fallback={null} → no se ve nada extra mientras hidrata (el
          filter monta en ms, no hace fetch). */}
      <Suspense fallback={null}>
        <IncidentFilters
          role={session.user.role}
          currentStatus={params.status}
          currentPriority={params.priority}
          currentSearch={params.search}
          currentAssigned={params.assigned}
        />
      </Suspense>

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
                {!isClient && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prioridad
                    </th>
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
                const statusLabel = statusLabelFor(
                  session.user.role,
                  incident.status
                );
                const statusClassName = statusClassFor(
                  session.user.role,
                  incident.status
                );
                const priority = PRIORITY_CONFIG[incident.priority];
                // Jerarquía visual SOLO para staff:
                //   - Sin asignar y activa → resaltada (borde teal + bg sutil).
                //   - Cerrada/Resuelta    → atenuada (opacity-70) para que
                //                           "pese" menos cuando se ven mezcladas.
                //   - Asignada y activa   → sin cambios respecto a antes.
                // CLIENT no entra en estas variantes: !isClient en isUnassignedActive
                // y, aunque tenga isDone, su lista no rinde la columna Asignado y
                // la opacidad afecta uniformemente — aceptable porque su default
                // ya es "Activas" (cerradas ocultas salvo que las pida).
                const isDone =
                  incident.status === "RESOLVED" || incident.status === "CLOSED";
                const isUnassignedActive =
                  !isClient && !incident.assignedTo && !isDone;
                return (
                  <tr
                    key={incident.id}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      isUnassignedActive &&
                        "border-l-2 border-l-[#275d6b] bg-[#275d6b]/[0.03]",
                      isDone && "opacity-70"
                    )}
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
                          statusClassName
                        )}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    {!isClient && (
                      <>
                        <td className="px-4 py-3">
                          <span className={cn("text-sm", priority.className)}>
                            {priority.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {incident.company.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {incident.assignedTo ? (
                            `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
                          ) : isDone ? (
                            // Cerrada sin asignado → "—" neutral.
                            // No comunica urgencia (no la hay).
                            "—"
                          ) : (
                            // Activa sin asignar → badge ámbar sutil que
                            // comunica "necesita acción", en lugar del "—"
                            // genérico que se confundía con "vacío".
                            <span className="inline-block px-2 py-0.5 text-xs rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                              Sin asignar
                            </span>
                          )}
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
                href={`/incidencias?page=${page}${params.status ? `&status=${params.status}` : ""}${!isClient && params.priority ? `&priority=${params.priority}` : ""}${params.search ? `&search=${params.search}` : ""}${assignedToMe ? `&assigned=me` : ""}`}
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
