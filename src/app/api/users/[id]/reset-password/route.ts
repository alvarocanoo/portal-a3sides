import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserService } from "@/services/user.service";
import { AuditService } from "@/services/audit.service";
import { sendEmail } from "@/lib/email";
import { passwordReset } from "@/lib/email/templates";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    // ── Reset: genera nueva temporal, fuerza cambio en próximo login ──
    const { email, firstName, tempPassword } = await UserService.resetPassword(id);

    await AuditService.log({
      action: "user.password_reset",
      userId: session.user.id,
      entityType: "User",
      entityId: id,
      // Email es útil para identificar al usuario en el log; tempPassword
      // NUNCA se loguea (se envía al usuario por email).
      metadata: { email },
    });

    // ── Envío síncrono del email (mismo patrón que create-user) ───────
    // Si se envía: respuesta sin contraseña por pantalla.
    // Si falla: devolvemos tempPassword como respaldo para que el admin
    // pueda comunicarla manualmente.
    const reset = passwordReset({ firstName, email, tempPassword });
    const emailSent = await sendEmail({
      to: email,
      subject: reset.subject,
      html: reset.html,
    });

    return NextResponse.json({
      emailSent,
      tempPassword: emailSent ? null : tempPassword,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Usuario no encontrado" },
          { status: 404 }
        );
      }
      if (error.message === "USER_INACTIVE") {
        return NextResponse.json(
          { error: "No se puede resetear la contraseña de un usuario inactivo" },
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
