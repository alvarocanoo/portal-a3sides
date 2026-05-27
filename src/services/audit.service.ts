import { prisma } from "@/lib/db";

interface AuditInput {
  action: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
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

  static async list(page = 1, limit = 50) {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }
}
