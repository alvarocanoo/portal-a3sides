import { requireRole } from "@/lib/auth/helpers";
import { AuditService } from "@/services/audit.service";

const ACTION_LABELS: Record<string, string> = {
  "incident.create": "Incidencia creada",
  "incident.status_change": "Cambio de estado",
  "incident.assign": "Incidencia asignada",
  "user.create": "Usuario creado",
  "user.update": "Usuario modificado",
  "company.create": "Empresa creada",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  const result = await AuditService.list(page, 30);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Registro de actividad
      </h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay registros de actividad.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Accion
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Entidad
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {result.items.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("es-ES")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "Sistema"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                    {log.entityType
                      ? `${log.entityType} ${log.entityId?.slice(0, 8) || ""}...`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                    {log.metadata
                      ? JSON.stringify(log.metadata).slice(0, 80)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
