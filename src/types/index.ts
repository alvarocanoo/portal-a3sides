export enum Role {
  CLIENT = "CLIENT",
  AGENT = "AGENT",
  ADMIN = "ADMIN",
}

export enum IncidentStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_CLIENT = "WAITING_CLIENT",
  WAITING_THIRD_PARTY = "WAITING_THIRD_PARTY",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export const VALID_TRANSITIONS: Record<IncidentStatus, { to: IncidentStatus; roles: Role[] }[]> = {
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
