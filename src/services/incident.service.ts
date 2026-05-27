import { prisma } from "@/lib/db";
import type { IncidentStatus, Priority, Role, Prisma } from "@prisma/client";
import { VALID_TRANSITIONS } from "@/lib/incident-states";

interface CreateIncidentInput {
  subject: string;
  description: string;
  priority: Priority;
  category?: string;
  companyId: string;
  createdById: string;
}

interface ListIncidentsInput {
  page: number;
  limit: number;
  status?: IncidentStatus;
  priority?: Priority;
  search?: string;
  assignedToId?: string;
  companyId?: string;
  role: Role;
}

export class IncidentService {
  static async create(input: CreateIncidentInput) {
    const reference = await this.generateReference();

    return prisma.incident.create({
      data: {
        reference,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
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

    if (input.status) where.status = input.status;
    if (input.priority) where.priority = input.priority;
    if (input.assignedToId) where.assignedToId = input.assignedToId;

    if (input.search) {
      where.OR = [
        { subject: { contains: input.search, mode: "insensitive" } },
        { reference: { contains: input.search, mode: "insensitive" } },
        { description: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          company: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
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

  static async assign(
    incidentId: string,
    assignedToId: string,
    userRole: Role
  ) {
    if (userRole === "CLIENT") throw new Error("FORBIDDEN");

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new Error("INCIDENT_NOT_FOUND");

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
