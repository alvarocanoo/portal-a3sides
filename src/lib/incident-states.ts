// ─────────────────────────────────────────────────────────
// Maquina de estados de incidencias — FUENTE UNICA DE VERDAD
//
// Cualquier cambio en estados, labels, estilos o transiciones
// se hace SOLO aqui. Todas las vistas importan de este modulo.
// ─────────────────────────────────────────────────────────

import { Role } from "@/types";

// ─── Enum ───────────────────────────────────────────────

export enum IncidentStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_CLIENT = "WAITING_CLIENT",
  WAITING_THIRD_PARTY = "WAITING_THIRD_PARTY",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

// ─── Config visual (label + estilo) ─────────────────────

export const STATUS_CONFIG = {
  [IncidentStatus.OPEN]: {
    label: "Abierta",
    className: "bg-orange-100 text-orange-800",
  },
  [IncidentStatus.IN_PROGRESS]: {
    label: "En curso",
    className: "bg-blue-100 text-blue-800",
  },
  [IncidentStatus.WAITING_CLIENT]: {
    label: "Esp. cliente",
    className: "bg-yellow-100 text-yellow-800",
  },
  [IncidentStatus.WAITING_THIRD_PARTY]: {
    label: "Esp. tercero",
    className: "bg-purple-100 text-purple-800",
  },
  [IncidentStatus.RESOLVED]: {
    label: "Resuelta",
    className: "bg-green-100 text-green-800",
  },
  [IncidentStatus.CLOSED]: {
    label: "Cerrada",
    className: "bg-gray-100 text-gray-800",
  },
} as const satisfies Record<IncidentStatus, { label: string; className: string }>;

// ─── Transiciones validas ───────────────────────────────

export const VALID_TRANSITIONS: Record<
  IncidentStatus,
  { to: IncidentStatus; roles: Role[] }[]
> = {
  [IncidentStatus.OPEN]: [
    { to: IncidentStatus.IN_PROGRESS, roles: [Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.CLOSED, roles: [Role.AGENT, Role.ADMIN] },
  ],
  [IncidentStatus.IN_PROGRESS]: [
    { to: IncidentStatus.WAITING_CLIENT, roles: [Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.WAITING_THIRD_PARTY, roles: [Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.RESOLVED, roles: [Role.AGENT, Role.ADMIN] },
  ],
  [IncidentStatus.WAITING_CLIENT]: [
    { to: IncidentStatus.IN_PROGRESS, roles: [Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.CLOSED, roles: [Role.ADMIN] },
  ],
  [IncidentStatus.WAITING_THIRD_PARTY]: [
    { to: IncidentStatus.IN_PROGRESS, roles: [Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.RESOLVED, roles: [Role.AGENT, Role.ADMIN] },
  ],
  [IncidentStatus.RESOLVED]: [
    { to: IncidentStatus.CLOSED, roles: [Role.CLIENT, Role.AGENT, Role.ADMIN] },
    { to: IncidentStatus.IN_PROGRESS, roles: [Role.CLIENT, Role.AGENT, Role.ADMIN] },
  ],
  [IncidentStatus.CLOSED]: [],
};

// ─── Helpers ────────────────────────────────────────────

export function statusLabel(key: string): string {
  return STATUS_CONFIG[key as IncidentStatus]?.label ?? key;
}

export function statusClass(key: string): string {
  return STATUS_CONFIG[key as IncidentStatus]?.className ?? "bg-gray-100 text-gray-800";
}

export const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  ...Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({
    value,
    label,
  })),
];

// ───────────────────────────────────────────────────────────────────────
// Vista del CLIENT — capa de presentación
//
// El cliente solo ve 4 etiquetas (Abierta, En proceso, Esperando tu
// respuesta, Cerrada) en lugar de los 6 estados internos. Pares que se
// agrupan:
//   IN_PROGRESS + WAITING_THIRD_PARTY → "En proceso" (mismo color azul)
//   RESOLVED    + CLOSED              → "Cerrada"   (mismo color gris)
//
// IMPORTANTE: esto es SOLO presentación. La máquina de estados
// (VALID_TRANSITIONS), el enum de Prisma, los endpoints y las
// transiciones reales NO se tocan. AGENT/ADMIN siguen viendo y operando
// los 6 estados reales con sus labels originales (STATUS_CONFIG).
// ───────────────────────────────────────────────────────────────────────

export const CLIENT_STATUS_CONFIG = {
  [IncidentStatus.OPEN]: {
    label: "Abierta",
    className: "bg-orange-100 text-orange-800",
  },
  [IncidentStatus.IN_PROGRESS]: {
    label: "En proceso",
    className: "bg-blue-100 text-blue-800",
  },
  [IncidentStatus.WAITING_CLIENT]: {
    label: "Esperando tu respuesta",
    className: "bg-yellow-100 text-yellow-800",
  },
  [IncidentStatus.WAITING_THIRD_PARTY]: {
    label: "En proceso",
    className: "bg-blue-100 text-blue-800",
  },
  [IncidentStatus.RESOLVED]: {
    label: "Cerrada",
    className: "bg-gray-100 text-gray-800",
  },
  [IncidentStatus.CLOSED]: {
    label: "Cerrada",
    className: "bg-gray-100 text-gray-800",
  },
} as const satisfies Record<IncidentStatus, { label: string; className: string }>;

// Pseudo-valores del dropdown del cliente (NO son IncidentStatus reales).
// La página los expande con `expandClientStatusFilter` antes de pasarlos
// al servicio.
export const CLIENT_STATUS_PSEUDO = {
  IN_PROCESS: "IN_PROCESS",
  CLOSED_GROUP: "CLOSED_GROUP",
  ALL: "ALL",
} as const;

export const CLIENT_STATUS_OPTIONS = [
  { value: "", label: "Activas" },
  { value: CLIENT_STATUS_PSEUDO.IN_PROCESS, label: "En proceso" },
  { value: IncidentStatus.WAITING_CLIENT, label: "Esperando tu respuesta" },
  { value: CLIENT_STATUS_PSEUDO.CLOSED_GROUP, label: "Cerradas" },
  { value: CLIENT_STATUS_PSEUDO.ALL, label: "Todas (incluye cerradas)" },
];

/**
 * Traduce el valor del dropdown de estado del CLIENT a un filtro de
 * estado utilizable por el servicio:
 *   - string IncidentStatus → filtro directo por ese estado.
 *   - array IncidentStatus[] → filtro `where.status: { in: [...] }`.
 *   - undefined → sin filtro (todas las 6).
 *
 * "" (sin selección) = "Activas" = todo menos RESOLVED/CLOSED.
 * "ALL" = sin filtro (incluye cerradas).
 */
export function expandClientStatusFilter(
  value: string | undefined
):
  | IncidentStatus
  | IncidentStatus[]
  | undefined {
  switch (value) {
    case undefined:
    case "":
      return [
        IncidentStatus.OPEN,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.WAITING_CLIENT,
        IncidentStatus.WAITING_THIRD_PARTY,
      ];
    case CLIENT_STATUS_PSEUDO.IN_PROCESS:
      return [IncidentStatus.IN_PROGRESS, IncidentStatus.WAITING_THIRD_PARTY];
    case CLIENT_STATUS_PSEUDO.CLOSED_GROUP:
      return [IncidentStatus.RESOLVED, IncidentStatus.CLOSED];
    case CLIENT_STATUS_PSEUDO.ALL:
      return undefined;
    case IncidentStatus.OPEN:
    case IncidentStatus.WAITING_CLIENT:
      return value as IncidentStatus;
    default:
      // Cualquier otro valor (incluidos IN_PROGRESS / WAITING_THIRD_PARTY /
      // RESOLVED / CLOSED que un CLIENT no debería mandar, pero puede
      // llegar copiando una URL del agente): por consistencia, lo
      // tratamos como filtro directo si es un IncidentStatus real, sino
      // como "Activas". Esto es defensivo, no operativo.
      if (Object.values(IncidentStatus).includes(value as IncidentStatus)) {
        return value as IncidentStatus;
      }
      return [
        IncidentStatus.OPEN,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.WAITING_CLIENT,
        IncidentStatus.WAITING_THIRD_PARTY,
      ];
  }
}

/**
 * Devuelve el label visible del estado según el rol. CLIENT ve los
 * labels agrupados de `CLIENT_STATUS_CONFIG`; el resto, los reales de
 * `STATUS_CONFIG`. Este helper es el único punto de uso desde la UI —
 * NO usar `statusLabel` directamente en sitios donde el rol importa.
 */
export function statusLabelFor(role: Role | string, key: string): string {
  if (role === Role.CLIENT) {
    return CLIENT_STATUS_CONFIG[key as IncidentStatus]?.label ?? key;
  }
  return statusLabel(key);
}

export function statusClassFor(role: Role | string, key: string): string {
  if (role === Role.CLIENT) {
    return (
      CLIENT_STATUS_CONFIG[key as IncidentStatus]?.className ??
      "bg-gray-100 text-gray-800"
    );
  }
  return statusClass(key);
}

// ───────────────────────────────────────────────────────────────────────
// Vista de STAFF (AGENT/ADMIN) — capa de presentación de filtros
//
// Misma lógica de "ocultar cerradas por defecto" que el CLIENT, pero
// usando los NOMBRES REALES (En curso, Esp. cliente, Esp. tercero,
// Resuelta, Cerrada). Sin agrupación de etiquetas — el staff sigue
// distinguiendo IN_PROGRESS de WAITING_THIRD_PARTY y RESOLVED de CLOSED.
//
// Pseudo-valor único: "ALL" → sin filtro (incluye RESOLVED/CLOSED).
// "" (default) → solo activas: OPEN + IN_PROGRESS + WAITING_CLIENT +
// WAITING_THIRD_PARTY.
// ───────────────────────────────────────────────────────────────────────

export const STAFF_STATUS_PSEUDO = {
  ALL: "ALL",
} as const;

// 4 estados activos + 2 cerrados (con sus labels reales de STATUS_CONFIG)
// + "Activas" (default) + "Todas (incluye cerradas)".
export const STAFF_STATUS_OPTIONS = [
  { value: "", label: "Activas" },
  { value: IncidentStatus.OPEN, label: STATUS_CONFIG[IncidentStatus.OPEN].label },
  { value: IncidentStatus.IN_PROGRESS, label: STATUS_CONFIG[IncidentStatus.IN_PROGRESS].label },
  { value: IncidentStatus.WAITING_CLIENT, label: STATUS_CONFIG[IncidentStatus.WAITING_CLIENT].label },
  { value: IncidentStatus.WAITING_THIRD_PARTY, label: STATUS_CONFIG[IncidentStatus.WAITING_THIRD_PARTY].label },
  { value: IncidentStatus.RESOLVED, label: STATUS_CONFIG[IncidentStatus.RESOLVED].label },
  { value: IncidentStatus.CLOSED, label: STATUS_CONFIG[IncidentStatus.CLOSED].label },
  { value: STAFF_STATUS_PSEUDO.ALL, label: "Todas (incluye cerradas)" },
];

/**
 * Traduce el valor del dropdown de estado del STAFF (AGENT/ADMIN) a un
 * filtro de estado utilizable por el servicio. Misma forma de salida que
 * `expandClientStatusFilter`.
 *
 * Defensivo: también acepta los pseudo-valores del CLIENT (IN_PROCESS,
 * CLOSED_GROUP) por si un ADMIN abre una URL compartida por un CLIENT —
 * los expande igual. Esto cierra el bug A2 (HTTP 500 al recibir
 * pseudos en el camino ADMIN).
 */
export function expandStaffStatusFilter(
  value: string | undefined
): IncidentStatus | IncidentStatus[] | undefined {
  switch (value) {
    case undefined:
    case "":
      return [
        IncidentStatus.OPEN,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.WAITING_CLIENT,
        IncidentStatus.WAITING_THIRD_PARTY,
      ];
    case STAFF_STATUS_PSEUDO.ALL:
      return undefined;
    // Defensiva: pseudos del CLIENT que el ADMIN podría recibir por
    // URL compartida. Los expandimos igual que para CLIENT.
    case CLIENT_STATUS_PSEUDO.IN_PROCESS:
      return [IncidentStatus.IN_PROGRESS, IncidentStatus.WAITING_THIRD_PARTY];
    case CLIENT_STATUS_PSEUDO.CLOSED_GROUP:
      return [IncidentStatus.RESOLVED, IncidentStatus.CLOSED];
    default:
      // Estado real → filtro directo. Cualquier valor desconocido cae a
      // "Activas" (no rompe la lista).
      if (Object.values(IncidentStatus).includes(value as IncidentStatus)) {
        return value as IncidentStatus;
      }
      return [
        IncidentStatus.OPEN,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.WAITING_CLIENT,
        IncidentStatus.WAITING_THIRD_PARTY,
      ];
  }
}
