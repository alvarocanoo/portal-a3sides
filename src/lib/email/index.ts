import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

// Kinds permitidos para tracking. String literal union → si añades uno
// nuevo (ej. "notification.foo"), TypeScript te obliga a actualizar
// también el dashboard que lo lista. Documentado en
// prisma/schema.prisma > model NotificationAttempt.
export type NotificationKind =
  | "incident.created"
  | "message.new"
  | "status.changed"
  | "assigned"
  | "user.invitation"
  | "user.password_reset";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  // Si está presente: registramos el intento en NotificationAttempt
  // (éxito o fallo). Si no: comportamiento legacy sin registro — útil
  // para emails que no son notificaciones rastreables del sistema.
  tracking?: {
    kind: NotificationKind;
    incidentId?: string;
  };
}

function getTransporter() {
  const host = process.env.SMTP_HOST;

  if (!host) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Registra el intento en BD. Best-effort: si la inserción falla NO
// rompemos el envío — solo logueamos al stderr. Razón: un fallo de
// instrumentación NO debe degradar el flujo de notificación.
async function recordAttempt(
  recipient: string,
  tracking: { kind: NotificationKind; incidentId?: string },
  sent: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    await prisma.notificationAttempt.create({
      data: {
        kind: tracking.kind,
        recipient,
        status: sent ? "sent" : "failed",
        error: sent ? null : errorMessage ?? "unknown",
        incidentId: tracking.incidentId ?? null,
      },
    });
  } catch (e) {
    console.error(
      `[notification-log] Fallo registrando intento (kind=${tracking.kind}, recipient=${recipient}):`,
      e
    );
  }
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const transporter = getTransporter();

  // ── Modo consola (sin SMTP_HOST) ───────────────────────────────────
  // En dev sin SMTP, el envío se loguea y se considera "exitoso" para
  // que el flujo siga. Registramos como "sent" porque desde el punto
  // de vista del sistema, el handoff funcionó (no hay caída del SMTP
  // que rastrear). Esto evita falsos positivos de "failed" en local.
  if (!transporter) {
    console.log("[EMAIL - modo consola]");
    console.log(`  Para: ${input.to}`);
    console.log(`  Asunto: ${input.subject}`);
    console.log(`  Contenido: ${input.html.slice(0, 200)}...`);
    if (input.tracking) {
      await recordAttempt(input.to, input.tracking, true);
    }
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "Portal a3sides <noreply@a3sides.es>",
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (input.tracking) {
      await recordAttempt(input.to, input.tracking, true);
    }
    return true;
  } catch (error) {
    console.error("[EMAIL] Error al enviar:", error);
    if (input.tracking) {
      const msg = error instanceof Error ? error.message : String(error);
      await recordAttempt(input.to, input.tracking, false, msg);
    }
    return false;
  }
}
