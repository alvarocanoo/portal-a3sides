import { prisma } from "@/lib/db";
import type { IncidentStatus, Priority, Role, Prisma } from "@prisma/client";
import { VALID_TRANSITIONS } from "@/lib/incident-states";

interface CreateIncidentInput {
  subject: string;
  description: string;
  category?: string;
  companyId: string;
  createdById: string;
}

interface ListIncidentsInput {
  page: number;
  limit: number;
  // Acepta string (filtro directo), array (filtro `where.status: { in: [...] }`)
  // o undefined (sin filtro). El array lo usa la vista CLIENT para agrupar
  // estados internos (ej. IN_PROGRESS + WAITING_THIRD_PARTY → "En proceso").
  status?: IncidentStatus | IncidentStatus[];
  priority?: Priority;
  search?: string;
  assignedToId?: string;
  companyId?: string;
  role: Role;
  // Si true: orden custom para CLIENT (WAITING_CLIENT arriba → resto activas
  // → cerradas, cada grupo por createdAt desc) con paginación EN MEMORIA.
  // Si false/undefined: comportamiento actual (orderBy createdAt desc en BD,
  // paginación en BD).
  clientOrder?: boolean;
  // Si true: orden custom para STAFF (AGENT/ADMIN). Similar al CLIENT
  // pero con prioridad operativa distinta:
  //   1. WAITING_CLIENT + WAITING_THIRD_PARTY (esperan acción del otro
  //      lado — el equipo debe vigilarlas).
  //   2. OPEN + IN_PROGRESS (trabajo activo del equipo).
  //   3. RESOLVED + CLOSED (cerradas, si están visibles).
  // Cada grupo por createdAt desc. Misma justificación que clientOrder:
  // memoria con cap, lejos del techo en el que conviene SQL raw.
  staffOrder?: boolean;
}

// Cap interno duro para la query del CLIENT cuando clientOrder=true. La
// ordenación se hace en memoria porque Prisma no soporta `CASE WHEN
// status='WAITING_CLIENT' THEN 0 ELSE 1 END` sin SQL raw. Para los
// volúmenes esperados por cliente (decenas, máximo cientos) es trivial.
// Si en el futuro un cliente acumula >500 incidencias activas, hay que
// pasar a SQL raw con CASE.
const CLIENT_ORDER_FETCH_CAP = 500;

// Mismo cap para el orden STAFF. El staff puede ver más volumen (todas
// las empresas) pero por defecto se OCULTAN las cerradas, así que el
// trabajo activo realista cabe en 500 holgadamente. Si crece, igual:
// SQL raw con CASE.
const STAFF_ORDER_FETCH_CAP = 500;

// Prioridad de cada estado en el orden CLIENT. Menor = más arriba.
const CLIENT_STATUS_SORT_RANK: Record<string, number> = {
  WAITING_CLIENT: 0,
  OPEN: 1,
  IN_PROGRESS: 1,
  WAITING_THIRD_PARTY: 1,
  RESOLVED: 2,
  CLOSED: 2,
};

// Prioridad de cada estado en el orden STAFF. Menor = más arriba.
// Las dos esperas (cliente + tercero) van juntas arriba porque ambas
// requieren atención/seguimiento del equipo.
const STAFF_STATUS_SORT_RANK: Record<string, number> = {
  WAITING_CLIENT: 0,
  WAITING_THIRD_PARTY: 0,
  OPEN: 1,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 2,
};

export class IncidentService {
  static async create(input: CreateIncidentInput) {
    const reference = await this.generateReference();

    return prisma.incident.create({
      data: {
        reference,
        subject: input.subject,
        description: input.description,
        // priority omitido: Prisma aplica el default MEDIUM definido en el
        // schema. El triaje lo hace AGENT/ADMIN vía changePriority().
        category: input.category,
        companyId: input.companyId,
        createdById: input.createdById,
        status: "OPEN",
      },
      include: {
        company: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  static async list(input: ListIncidentsInput) {
    const where: Prisma.IncidentWhereInput = {};

    if (input.role === "CLIENT" && input.companyId) {
      where.companyId = input.companyId;
    }

    if (input.status !== undefined) {
      where.status = Array.isArray(input.status)
        ? { in: input.status }
        : input.status;
    }
    if (input.priority) where.priority = input.priority;
    if (input.assignedToId) where.assignedToId = input.assignedToId;

    if (input.search) {
      where.OR = [
        { subject: { contains: input.search, mode: "insensitive" } },
        { reference: { contains: input.search, mode: "insensitive" } },
        { description: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const include = {
      company: { select: { name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    };

    // ── Caminos con orden custom + paginación en memoria ──────────────
    // Centralizamos los dos casos (CLIENT y STAFF) en una sola rama. El
    // único cambio entre ellos es el `rank` que usamos para ordenar.
    const customOrder = input.clientOrder
      ? { rank: CLIENT_STATUS_SORT_RANK, cap: CLIENT_ORDER_FETCH_CAP }
      : input.staffOrder
        ? { rank: STAFF_STATUS_SORT_RANK, cap: STAFF_ORDER_FETCH_CAP }
        : null;

    if (customOrder) {
      const allItems = await prisma.incident.findMany({
        where,
        include,
        // Sin orderBy en BD porque queremos un orden derivado del enum
        // que Prisma no expresa sin SQL raw. Cap duro para que la query
        // no se descontrole si acumulan muchas incidencias.
        take: customOrder.cap,
      });

      const sorted = [...allItems].sort((a, b) => {
        const ra = customOrder.rank[a.status] ?? 99;
        const rb = customOrder.rank[b.status] ?? 99;
        if (ra !== rb) return ra - rb;
        // Mismo grupo: más reciente arriba
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const total = sorted.length;
      const start = (input.page - 1) * input.limit;
      const items = sorted.slice(start, start + input.limit);

      return {
        items,
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      };
    }

    // ── Camino AGENT/ADMIN: comportamiento actual (sin cambios) ───────
    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      prisma.incident.count({ where }),
    ]);

    return {
      items,
      total,
      page: input.page,
      totalPages: Math.ceil(total / input.limit),
    };
  }

  static async getById(id: string, userRole: Role, companyId?: string | null) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        messages: {
          where: userRole === "CLIENT" ? { isInternal: false } : {},
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
            attachments: true,
          },
          orderBy: { createdAt: "asc" },
        },
        attachments: {
          where: { messageId: null },
        },
        statusChanges: {
          include: {
            changedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!incident) return null;

    if (userRole === "CLIENT" && incident.companyId !== companyId) {
      return null;
    }

    return incident;
  }

  static async changeStatus(
    incidentId: string,
    newStatus: IncidentStatus,
    changedById: string,
    userRole: Role,
    companyId: string | null,
    reason?: string
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) throw new Error("INCIDENT_NOT_FOUND");

    if (userRole === "CLIENT" && incident.companyId !== companyId) {
      throw new Error("FORBIDDEN");
    }

    const transitions = VALID_TRANSITIONS[incident.status as keyof typeof VALID_TRANSITIONS];
    const allowed = transitions?.find(
      (t) => t.to === newStatus && t.roles.includes(userRole as never)
    );

    if (!allowed) {
      throw new Error("INVALID_TRANSITION");
    }

    const updateData: Prisma.IncidentUpdateInput = {
      status: newStatus,
    };

    if (newStatus === "RESOLVED" && !incident.resolvedAt) {
      updateData.resolvedAt = new Date();
    }
    if (newStatus === "CLOSED" && !incident.closedAt) {
      updateData.closedAt = new Date();
    }
    if (newStatus === "IN_PROGRESS" && incident.status === "RESOLVED") {
      updateData.resolvedAt = null;
    }

    // ─── REGLA DE NEGOCIO: "Tomar incidencia" = asignarse a si mismo ───
    // Cuando un AGENT/ADMIN pasa una incidencia de OPEN a IN_PROGRESS,
    // se asigna automaticamente a quien pulsa. Si ya estaba asignada a
    // otro agente, el frontend ha pedido confirmacion antes.
    if (
      incident.status === "OPEN" &&
      newStatus === "IN_PROGRESS" &&
      userRole !== "CLIENT"
    ) {
      updateData.assignedTo = { connect: { id: changedById } };
    }

    const [updated] = await prisma.$transaction([
      prisma.incident.update({
        where: { id: incidentId },
        data: updateData,
      }),
      prisma.statusChange.create({
        data: {
          fromStatus: incident.status,
          toStatus: newStatus,
          reason,
          incidentId,
          changedById,
        },
      }),
    ]);

    return updated;
  }

  /**
   * Cambia la prioridad de una incidencia. SOLO AGENT/ADMIN.
   *
   * Defensa en profundidad: aunque el endpoint /api/incidents/[id]/priority
   * ya rechaza CLIENT con 403, el servicio repite el check para que un
   * futuro endpoint o consumer interno que olvide la verificación no
   * pueda saltarse la restricción.
   *
   * No-op silencioso si la prioridad pedida coincide con la actual:
   * devuelve `changed: false` y NO escribe en BD. El endpoint usa este
   * flag para decidir si emitir audit log (evita duplicados ruidosos
   * cuando la UI dispara onChange con el valor que ya estaba).
   */
  static async changePriority(
    incidentId: string,
    newPriority: Priority,
    userRole: Role
  ): Promise<{
    incident: { id: string; reference: string; priority: Priority };
    fromPriority: Priority;
    toPriority: Priority;
    changed: boolean;
  }> {
    if (userRole === "CLIENT") throw new Error("FORBIDDEN");

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, reference: true, priority: true },
    });

    if (!incident) throw new Error("INCIDENT_NOT_FOUND");

    if (incident.priority === newPriority) {
      return {
        incident,
        fromPriority: incident.priority,
        toPriority: newPriority,
        changed: false,
      };
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: { priority: newPriority },
      select: { id: true, reference: true, priority: true },
    });

    return {
      incident: updated,
      fromPriority: incident.priority,
      toPriority: newPriority,
      changed: true,
    };
  }

  static async assign(
    incidentId: string,
    assignedToId: string,
    userRole: Role,
    userId: string
  ) {
    if (userRole === "CLIENT") throw new Error("FORBIDDEN");

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new Error("INCIDENT_NOT_FOUND");

    // ── Regla de reasignación ──────────────────────────────────────
    // ADMIN: siempre puede asignar/reasignar.
    // AGENT: solo si NO hay asignado actual (asignar incidencia libre)
    //        o si ES el asignado actual (cederla a otro). NUNCA puede
    //        "robar" una incidencia ya en manos de otro agente.
    // ──────────────────────────────────────────────────────────────
    if (
      userRole === "AGENT" &&
      incident.assignedToId &&
      incident.assignedToId !== userId
    ) {
      throw new Error("FORBIDDEN");
    }

    const agent = await prisma.user.findUnique({
      where: { id: assignedToId },
    });
    if (!agent || !agent.isActive || agent.role === "CLIENT") {
      throw new Error("INVALID_AGENT");
    }

    return prisma.incident.update({
      where: { id: incidentId },
      data: { assignedToId },
    });
  }

  static async addMessage(
    incidentId: string,
    content: string,
    authorId: string,
    isInternal: boolean,
    userRole: Role,
    companyId: string | null
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) throw new Error("INCIDENT_NOT_FOUND");

    if (userRole === "CLIENT") {
      if (incident.companyId !== companyId) throw new Error("FORBIDDEN");
      if (isInternal) throw new Error("FORBIDDEN");
    }

    const message = await prisma.message.create({
      data: {
        content,
        isInternal,
        incidentId,
        authorId,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    // Si el cliente responde y el ticket estaba esperando su respuesta, volver a IN_PROGRESS
    if (
      userRole === "CLIENT" &&
      incident.status === "WAITING_CLIENT"
    ) {
      await prisma.$transaction([
        prisma.incident.update({
          where: { id: incidentId },
          data: { status: "IN_PROGRESS" },
        }),
        prisma.statusChange.create({
          data: {
            fromStatus: "WAITING_CLIENT",
            toStatus: "IN_PROGRESS",
            reason: "Respuesta del cliente",
            incidentId,
            changedById: authorId,
          },
        }),
      ]);
    }

    // Registrar first response si es agente y no se ha respondido antes
    if (
      userRole !== "CLIENT" &&
      !isInternal &&
      !incident.firstResponseAt
    ) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: { firstResponseAt: new Date() },
      });
    }

    return message;
  }

  private static async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;

    const counter = await prisma.$transaction(async (tx) => {
      const existing = await tx.incidentCounter.findUnique({
        where: { id: "singleton" },
      });

      if (!existing || existing.year !== year) {
        return tx.incidentCounter.upsert({
          where: { id: "singleton" },
          update: { year, count: 1 },
          create: { id: "singleton", year, count: 1 },
        });
      }

      return tx.incidentCounter.update({
        where: { id: "singleton" },
        data: { count: { increment: 1 } },
      });
    });

    return `${prefix}${counter.count.toString().padStart(5, "0")}`;
  }
}
