import { requireRole } from "@/lib/auth/helpers";
import { AuditService } from "@/services/audit.service";
import { statusLabel, formatDateTime } from "@/lib/constants";

const ACTION_LABELS: Record<string, string> = {
  "incident.create": "Incidencia creada",
  "incident.status_change": "Cambio de estado",
  "incident.assign": "Incidencia asignada",
  "user.create": "Usuario creado",
  "user.update": "Usuario modificado",
  "company.create": "Empresa creada",
  "company.import_irecursos": "Empresa importada (iRecursos)",
  "company.import_existing": "Empresa vinculada (iRecursos)",
};

function formatMetadata(action: string, metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const m = metadata as Record<string, unknown>;

  if (action === "incident.status_change" && m.newStatus) {
    const reason = m.reason ? ` — ${m.reason}` : "";
    return `→ ${statusLabel(m.newStatus as string)}${reason}`;
  }
  if (action === "incident.create" && m.reference) {
    return String(m.reference);
  }
  if (action === "incident.assign" && m.assignedToId) {
    return `Asignado a ${String(m.assignedToId).slice(0, 8)}…`;
  }
  if ((action === "user.create" || action === "user.update") && m.email) {
    return String(m.email);
  }
  if (action.startsWith("company.") && m.name) {
    return String(m.name);
  }

  return JSON.stringify(metadata).slice(0, 60);
}

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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acción
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.items.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "Sistema"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatMetadata(log.action, log.metadata)}
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
