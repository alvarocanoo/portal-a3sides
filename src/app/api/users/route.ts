import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserService } from "@/services/user.service";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { createUserSchema } from "@/lib/validators/user";
import { sendEmail } from "@/lib/email";
import { userInvitation } from "@/lib/email/templates";

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

    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "user.create",
      userId: session.user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ipAddress,
      userAgent,
    });

    // ── Envío del email de invitación con la contraseña temporal ────────
    // Se hace de forma SÍNCRONA (no fire-and-forget) para poder decidir qué
    // devolver al admin: si el email se envió, no exponemos la contraseña en
    // la respuesta — el usuario la recibe directamente por su bandeja. Si el
    // envío falla, devolvemos tempPassword como respaldo para que el admin
    // pueda comunicársela manualmente (canal seguro) y la cuenta no quede
    // inaccesible.
    // ────────────────────────────────────────────────────────────────────
    const invitation = userInvitation({
      firstName: user.firstName,
      email: user.email,
      tempPassword,
    });
    const emailSent = await sendEmail({
      to: user.email,
      subject: invitation.subject,
      html: invitation.html,
    });

    return NextResponse.json(
      {
        user,
        emailSent,
        // Solo devolvemos tempPassword si el email falló (fallback admin).
        tempPassword: emailSent ? null : tempPassword,
      },
      { status: 201 }
    );
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
