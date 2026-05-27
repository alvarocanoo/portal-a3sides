import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserService } from "@/services/user.service";
import { AuditService } from "@/services/audit.service";
import { createUserSchema } from "@/lib/validators/user";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const role = searchParams.get("role") as "CLIENT" | "AGENT" | "ADMIN" | undefined;

    const result = await UserService.list(page, limit, role || undefined);
    return NextResponse.json(result);
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
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { user, tempPassword } = await UserService.create(parsed.data);

    await AuditService.log({
      action: "user.create",
      userId: session.user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    return NextResponse.json({ user, tempPassword }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EMAIL_ALREADY_EXISTS") {
        return NextResponse.json(
          { error: "Ya existe un usuario con ese email" },
          { status: 409 }
        );
      }
      if (error.message === "CLIENT_REQUIRES_COMPANY") {
        return NextResponse.json(
          { error: "Un usuario cliente necesita tener empresa asignada" },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
