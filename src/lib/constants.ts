export const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  OPEN: { label: "Abierta", className: "bg-orange-100 text-orange-800" },
  IN_PROGRESS: { label: "En curso", className: "bg-blue-100 text-blue-800" },
  WAITING_CLIENT: {
    label: "Esp. cliente",
    className: "bg-yellow-100 text-yellow-800",
  },
  WAITING_THIRD_PARTY: {
    label: "Esp. tercero",
    className: "bg-purple-100 text-purple-800",
  },
  RESOLVED: { label: "Resuelta", className: "bg-green-100 text-green-800" },
  CLOSED: { label: "Cerrada", className: "bg-gray-100 text-gray-800" },
};

export const PRIORITY_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  LOW: { label: "Baja", className: "text-gray-500" },
  MEDIUM: { label: "Media", className: "text-blue-600" },
  HIGH: { label: "Alta", className: "text-orange-600 font-medium" },
  CRITICAL: { label: "Crítica", className: "text-red-600 font-bold" },
};

export const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  ...Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({
    value,
    label,
  })),
];

export const PRIORITY_OPTIONS = [
  { value: "", label: "Todas" },
  ...Object.entries(PRIORITY_CONFIG).map(([value, { label }]) => ({
    value,
    label,
  })),
];

export const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Cliente",
  AGENT: "Agente",
  ADMIN: "Administrador",
};

export const BRAND = {
  primary: "#275d6b",
  primaryHover: "#1f4e5b",
  primaryLight: "rgba(39, 93, 107, 0.08)",
} as const;

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
