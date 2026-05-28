import { requireRole } from "@/lib/auth/helpers";
import { AuditService } from "@/services/audit.service";
import { statusLabel } from "@/lib/incident-states";
import { formatDateTime, ROLE_LABELS } from "@/lib/constants";

const ACTION_LABELS: Record<string, string> = {
  "incident.create": "Incidencia creada",
  "incident.status_change": "Cambio de estado",
  "incident.assign": "Incidencia asignada",
  "user.create": "Usuario creado",
  "user.update": "Usuario modificado",
  "company.create": "Empresa creada",
  "company.import_irecursos": "Empresa importada de iRecursos",
  "company.import_existing": "Empresa vinculada a iRecursos",
};

type AuditItem = Awaited<ReturnType<typeof AuditService.list>>["items"][number];

function formatEntity(item: AuditItem): string {
  const m = item.metadata as Record<string, unknown> | null;
  const ref = (m?.reference as string) || item._incidentRef;

  if (item.entityType === "Incident") {
    return ref ? `Incidencia ${ref}` : "Incidencia";
  }
  if (item.entityType === "User") {
    if (item._targetUser) {
      return `${item._targetUser.firstName} ${item._targetUser.lastName}`;
    }
    if (m?.email) return String(m.email);
    return "Usuario";
  }
  if (item.entityType === "Company") {
    if (m?.name) return String(m.name);
    return "Empresa";
  }
  return "—";
}

function formatDetails(item: AuditItem): string {
  const m = item.metadata as Record<string, unknown> | null;
  if (!m) return "—";

  switch (item.action) {
    case "incident.create":
      return "Nueva incidencia abierta";

    case "incident.status_change": {
      const label = m.newStatus ? statusLabel(m.newStatus as string) : "—";
      const reason = m.reason ? ` — ${m.reason}` : "";
      return `Estado cambiado a: ${label}${reason}`;
    }

    case "incident.assign": {
      const name = item._agentName;
      return name ? `Asignada a ${name}` : "Agente asignado";
    }

    case "user.create": {
      const role = m.role ? ROLE_LABELS[m.role as string] : null;
      return role ? `Nuevo usuario (${role})` : "Nuevo usuario";
    }

    case "user.update": {
      const changes: string[] = [];
      if (m.isActive === false) changes.push("desactivado");
      if (m.isActive === true) changes.push("activado");
      if (m.role && ROLE_LABELS[m.role as string]) {
        changes.push(`rol: ${ROLE_LABELS[m.role as string]}`);
      }
      if (m.firstName || m.lastName) changes.push("datos actualizados");
      if (m.companyId !== undefined) changes.push("empresa cambiada");
      return changes.length > 0 ? changes.join(", ") : "Datos modificados";
    }

    case "company.create":
      return "Nueva empresa registrada";

    case "company.import_irecursos":
      return m.irecursosCode
        ? `Importada desde iRecursos (código ${m.irecursosCode})`
        : "Importada desde iRecursos";

    case "company.import_existing":
      return "Empresa ya existente vinculada";

    default:
      return "—";
  }
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
                  Entidad
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
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatEntity(log)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDetails(log)}
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
