// ─── Fuente unica de verdad: Estados ────────────────────

export const STATUS_CONFIG = {
  OPEN: { label: "Abierta", className: "bg-orange-100 text-orange-800" },
  IN_PROGRESS: { label: "En curso", className: "bg-blue-100 text-blue-800" },
  WAITING_CLIENT: { label: "Esp. cliente", className: "bg-yellow-100 text-yellow-800" },
  WAITING_THIRD_PARTY: { label: "Esp. tercero", className: "bg-purple-100 text-purple-800" },
  RESOLVED: { label: "Resuelta", className: "bg-green-100 text-green-800" },
  CLOSED: { label: "Cerrada", className: "bg-gray-100 text-gray-800" },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function statusLabel(key: string): string {
  return STATUS_CONFIG[key as StatusKey]?.label ?? key;
}

export function statusClass(key: string): string {
  return STATUS_CONFIG[key as StatusKey]?.className ?? "bg-gray-100 text-gray-800";
}

// ─── Fuente unica de verdad: Prioridades ────────────────

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

// ─── Opciones para filtros (derivadas automaticamente) ──

export const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  ...Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({ value, label })),
];

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
