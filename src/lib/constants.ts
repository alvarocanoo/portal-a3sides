// ─── Prioridades ────────────────────────────────────────

export const PRIORITY_CONFIG = {
  LOW: { label: "Baja", className: "text-gray-500" },
  MEDIUM: { label: "Media", className: "text-blue-600" },
  HIGH: { label: "Alta", className: "text-orange-600 font-medium" },
  CRITICAL: { label: "Crítica", className: "text-red-600 font-bold" },
} as const;

export type PriorityKey = keyof typeof PRIORITY_CONFIG;

export function priorityLabel(key: string): string {
  return PRIORITY_CONFIG[key as PriorityKey]?.label ?? key;
}

export const PRIORITY_OPTIONS = [
  { value: "", label: "Todas" },
  ...Object.entries(PRIORITY_CONFIG).map(([value, { label }]) => ({ value, label })),
];

// ─── Roles ──────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Cliente",
  AGENT: "Agente",
  ADMIN: "Administrador",
};

// ─── Marca ──────────────────────────────────────────────

export const BRAND = {
  primary: "#275d6b",
  primaryHover: "#1f4e5b",
} as const;

// ─── Fechas (formato unico para todo el portal) ────────

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
