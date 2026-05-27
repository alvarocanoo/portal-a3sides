import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import type { Role } from "@prisma/client";

interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  companyId?: string;
}

export class UserService {
  static async create(input: CreateUserInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existing) throw new Error("EMAIL_ALREADY_EXISTS");

    if (input.role === "CLIENT" && !input.companyId) {
      throw new Error("CLIENT_REQUIRES_COMPANY");
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        companyId: input.companyId,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
      },
    });

    return { user, tempPassword };
  }

  static async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: Role;
      companyId?: string | null;
      isActive?: boolean;
    }
  ) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("USER_NOT_FOUND");

    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async list(page = 1, limit = 20, role?: Role) {
    const where = role ? { role } : {};
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  static async resetPassword(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("USER_NOT_FOUND");

    const tempPassword = this.generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    return { email: user.email, tempPassword };
  }

  private static generateTempPassword(): string {
    return randomBytes(12).toString("base64url").slice(0, 16);
  }
}
