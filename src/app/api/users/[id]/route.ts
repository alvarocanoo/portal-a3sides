import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserService } from "@/services/user.service";
import { AuditService } from "@/services/audit.service";
import { updateUserSchema } from "@/lib/validators/user";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // ── Auto-protección: un ADMIN no puede desactivarse a sí mismo ─────
    // Evita que un admin se bloquee la cuenta accidentalmente desde la UI.
    // Para reactivar, otro admin debe hacerlo (o intervenir en BD).
    // ──────────────────────────────────────────────────────────────────
    if (id === session.user.id && parsed.data.isActive === false) {
      return NextResponse.json(
        { error: "No puedes desactivarte a ti mismo" },
        { status: 400 }
      );
    }

    const user = await UserService.update(id, parsed.data);

    await AuditService.log({
      action: "user.update",
      userId: session.user.id,
      entityType: "User",
      entityId: id,
      metadata: parsed.data,
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
