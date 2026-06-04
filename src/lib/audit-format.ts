// Formateo del audit log para presentación (vista web + export CSV).
// Módulo puro: sin React, sin Next, sin Prisma directo — solo opera sobre
// los items ya enriquecidos que devuelve AuditService.list / listForExport.

import type { AuditService } from "@/services/audit.service";
import { statusLabel } from "@/lib/incident-states";
import { ROLE_LABELS } from "@/lib/constants";

export type EnrichedAuditItem = Awaited<
  ReturnType<typeof AuditService.list>
>["items"][number];

// Etiquetas legibles por acción. Si en el futuro se añade una acción
// nueva, añadirla aquí y aparecerá automáticamente en el dropdown de
// filtros (page.tsx la deriva de este record) y en cualquier render que
// use `ACTION_LABELS[code]`.
export const ACTION_LABELS: Record<string, string> = {
  "incident.create": "Incidencia creada",
  "incident.status_change": "Cambio de estado",
  "incident.assign": "Incidencia asignada",
  "incident.priority.change": "Prioridad cambiada",
  "user.create": "Usuario creado",
  "user.update": "Usuario modificado",
  "user.password_reset": "Contraseña restablecida",
  "user.password_changed": "Contraseña cambiada",
  "company.create": "Empresa creada",
  "company.update": "Empresa modificada",
  "company.import_irecursos": "Empresa importada de iRecursos",
  "company.import_existing": "Empresa vinculada a iRecursos",
  "audit.export": "Audit log exportado",
};

export function formatEntity(item: EnrichedAuditItem): string {
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

export function formatDetails(item: EnrichedAuditItem): string {
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

    case "incident.priority.change": {
      const from = m.fromPriority ? String(m.fromPriority) : "—";
      const to = m.toPriority ? String(m.toPriority) : "—";
      return `Prioridad: ${from} → ${to}`;
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

    case "user.password_reset":
      return "Contraseña temporal generada y enviada por email";

    case "user.password_changed":
      // Metadata: { firstAccess: boolean }. Distingue cambio forzoso de
      // primer acceso (mustChangePassword) del cambio voluntario.
      return m.firstAccess === true
        ? "Cambio inicial (primer acceso)"
        : "Cambio voluntario por el usuario";

    case "company.create":
      return "Nueva empresa registrada";

    case "company.update": {
      const changes: string[] = [];
      if (m.isActive === false) changes.push("desactivada");
      if (m.isActive === true) changes.push("reactivada");
      if (m.name) changes.push("nombre");
      if (m.taxId !== undefined) changes.push("CIF/NIF");
      if (m.irecursosClientId !== undefined) changes.push("ID iRecursos");
      return changes.length > 0 ? changes.join(", ") : "Datos modificados";
    }

    case "company.import_irecursos":
      return m.irecursosCode
        ? `Importada desde iRecursos (código ${m.irecursosCode})`
        : "Importada desde iRecursos";

    case "company.import_existing":
      return "Empresa ya existente vinculada";

    case "audit.export": {
      // Metadata esperada: { rows, truncated, filters }.
      // Mostramos algo útil al admin que revise el log.
      const rows = typeof m.rows === "number" ? m.rows : "?";
      const truncated = m.truncated === true ? " (truncado)" : "";
      return `Exportadas ${rows} filas${truncated}`;
    }

    default:
      return "—";
  }
}
