import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

interface AuditInput {
  action: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListAuditFilters {
  action?: string;
  // Fechas YA normalizadas por el caller: dateFrom = inicio del día (>=),
  // dateTo = inicio del día SIGUIENTE al "hasta" elegido (<). Así "hasta
  // 2026-06-03" incluye todo el día 3 sin tener que recordarlo aquí.
  dateFrom?: Date;
  dateTo?: Date;
  // Texto libre sobre nombre/apellido/email del usuario que hizo la acción.
  // Si está presente, excluye filas con userId=null (acciones de "Sistema")
  // — comportamiento deliberado: buscar un usuario no debe devolver eventos
  // sin usuario.
  userSearch?: string;
}

export class AuditService {
  // Construcción del where compartida por list() y listForExport(). Si en
  // el futuro se añade un filtro nuevo, basta con tocarlo aquí y los dos
  // consumidores quedan coherentes.
  private static buildAuditWhere(
    filters: ListAuditFilters
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.action) where.action = filters.action;

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lt: filters.dateTo }),
      };
    }

    if (filters.userSearch) {
      where.user = {
        OR: [
          { firstName: { contains: filters.userSearch, mode: "insensitive" } },
          { lastName: { contains: filters.userSearch, mode: "insensitive" } },
          { email: { contains: filters.userSearch, mode: "insensitive" } },
        ],
      };
    }

    return where;
  }

  // Enriquecimiento: resuelve referencias de incident (por entityId),
  // user destino (entityType=User) y agente asignado (metadata.assignedToId)
  // con N+1 queries acotadas (a lo sumo 3, una por tipo). Compartido por
  // list() y listForExport() para no duplicar lógica.
  private static async enrichAuditItems<
    T extends {
      entityType: string | null;
      entityId: string | null;
      metadata: Prisma.JsonValue;
    },
  >(items: T[]) {
    const incidentIds = items
      .filter((i) => i.entityType === "Incident" && i.entityId)
      .map((i) => i.entityId!);

    const userIds = items
      .filter((i) => i.entityType === "User" && i.entityId)
      .map((i) => i.entityId!);

    const agentIds = items
      .filter((i) => {
        const m = i.metadata as Record<string, unknown> | null;
        return m?.assignedToId && typeof m.assignedToId === "string";
      })
      .map((i) => (i.metadata as Record<string, unknown>).assignedToId as string);

    const [incidents, users, agents] = await Promise.all([
      incidentIds.length > 0
        ? prisma.incident.findMany({
            where: { id: { in: incidentIds } },
            select: { id: true, reference: true },
          })
        : [],
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [],
      agentIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: agentIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);

    const incidentMap = new Map(incidents.map((i) => [i.id, i.reference]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const agentMap = new Map(
      agents.map((a) => [a.id, `${a.firstName} ${a.lastName}`])
    );

    return items.map((item) => ({
      ...item,
      _incidentRef:
        item.entityType === "Incident" && item.entityId
          ? incidentMap.get(item.entityId) ?? null
          : null,
      _targetUser:
        item.entityType === "User" && item.entityId
          ? userMap.get(item.entityId) ?? null
          : null,
      _agentName: (() => {
        const m = item.metadata as Record<string, unknown> | null;
        if (m?.assignedToId)
          return agentMap.get(m.assignedToId as string) ?? null;
        return null;
      })(),
    }));
  }

  static async log(input: AuditInput) {
    return prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  static async list(page = 1, limit = 50, filters: ListAuditFilters = {}) {
    // where compartido con el count para que totalPages sea coherente con
    // los filtros (el bug clásico es contar sin filtros). buildAuditWhere
    // se reutiliza en listForExport.
    const where = this.buildAuditWhere(filters);

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const enriched = await this.enrichAuditItems(items);
    return { items: enriched, total, page, totalPages: Math.ceil(total / limit) };
  }

  // Variante para exportación: mismo where, sin paginar, con hardcap.
  // Usa `take: hardCap + 1` para detectar truncado sin un count extra;
  // si caemos en el +1, sabemos que había más filas y devolvemos
  // `truncated: true`. El caller (endpoint CSV) decide cómo mostrarlo.
  static async listForExport(
    filters: ListAuditFilters = {},
    hardCap = 10_000
  ) {
    const where = this.buildAuditWhere(filters);
    const items = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: hardCap + 1,
    });
    const truncated = items.length > hardCap;
    const sliced = truncated ? items.slice(0, hardCap) : items;
    const enriched = await this.enrichAuditItems(sliced);
    return { items: enriched, total: sliced.length, truncated };
  }
}
