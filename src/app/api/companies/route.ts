import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { createCompanySchema } from "@/lib/validators/user";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const companies = await prisma.company.findMany({
      include: {
        _count: { select: { users: true, incidents: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(companies);
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createCompanySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const company = await prisma.company.create({
      data: parsed.data,
    });

    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "company.create",
      userId: session.user.id,
      entityType: "Company",
      entityId: company.id,
      metadata: { name: company.name },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(company, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
