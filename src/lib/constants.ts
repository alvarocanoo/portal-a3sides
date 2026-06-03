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

// ─── Duraciones (SLA: tiempo entre dos eventos) ─────────
//
// Devuelve la duración en español compacto. Mismos cortes que usaríamos
// al hablar: "< 1min", "45min", "2h 15min", "1d 4h", "5d" (sin horas si
// son muchos días). Siempre se redondea hacia abajo (no exageramos los
// tiempos).
//
// Distinción explícita:
//   - "< 1min" → duración REAL corta (entre 1ms y 59 999 ms). Comunica
//     "fue muy rápido" sin parecer un cero engañoso.
//   - "0min"   → dato inválido o defensivo: ms <= 0, NaN, no finito,
//     o solo un argumento Date sin `end`. Cubre ENTRADAS MALAS, no
//     duraciones cortas legítimas.
//   - 0 exacto se considera "sin tiempo medible" (degenerado), agrupado
//     con el caso defensivo → "0min". No es una duración corta.
//
// Toma dos fechas o un número de milisegundos:
//   formatDuration(start, end)
//   formatDuration(ms)
export function formatDuration(
  startOrMs: Date | string | number,
  end?: Date | string | number
): string {
  let ms: number;
  if (end !== undefined) {
    const a = new Date(startOrMs).getTime();
    const b = new Date(end).getTime();
    ms = b - a;
  } else if (typeof startOrMs === "number") {
    ms = startOrMs;
  } else {
    // Si solo dan una fecha sin end, no tiene sentido. Defensivo: 0.
    ms = 0;
  }
  if (!isFinite(ms) || ms <= 0) return "0min";

  const minutes = Math.floor(ms / 60_000);
  if (minutes === 0) return "< 1min";
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours}h ${remMin}min` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  // A partir de 7 días omitimos las horas para no leer "12d 23h" — basta
  // el orden de magnitud.
  if (days >= 7) return `${days}d`;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}
