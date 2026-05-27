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
