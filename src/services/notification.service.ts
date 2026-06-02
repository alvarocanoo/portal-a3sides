import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  incidentCreatedClient,
  incidentCreatedAgent,
  newMessageNotification,
  statusChangedNotification,
} from "@/lib/email/templates";

export class NotificationService {
  static async onIncidentCreated(incidentId: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        createdBy: { select: { email: true, firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    });
    if (!incident) return;

    const clientEmail = incidentCreatedClient({
      reference: incident.reference,
      subject: incident.subject,
      incidentId: incident.id,
    });
    await sendEmail({
      to: incident.createdBy.email,
      ...clientEmail,
    });

    const agents = await prisma.user.findMany({
      where: { role: { in: ["AGENT", "ADMIN"] }, isActive: true },
      select: { email: true },
    });

    const agentEmail = incidentCreatedAgent({
      reference: incident.reference,
      subject: incident.subject,
      companyName: incident.company.name,
      createdBy: `${incident.createdBy.firstName} ${incident.createdBy.lastName}`,
      incidentId: incident.id,
    });

    await Promise.allSettled(
      agents.map((agent) =>
        sendEmail({ to: agent.email, ...agentEmail })
      )
    );
  }

  static async onNewMessage(
    incidentId: string,
    authorId: string,
    isInternal: boolean,
    content: string
  ) {
    if (isInternal) return;

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        createdBy: { select: { id: true, email: true } },
        assignedTo: { select: { id: true, email: true } },
      },
    });
    if (!incident) return;

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { firstName: true, lastName: true, role: true },
    });
    if (!author) return;

    const authorName = `${author.firstName} ${author.lastName}`;
    const emailData = newMessageNotification({
      reference: incident.reference,
      subject: incident.subject,
      authorName,
      preview: content,
      incidentId: incident.id,
    });

    if (author.role === "CLIENT") {
      if (incident.assignedTo) {
        // Caso normal: hay agente asignado, le notificamos solo a él.
        await sendEmail({ to: incident.assignedTo.email, ...emailData });
      } else {
        // Sin agente asignado: notificamos a TODOS los AGENT/ADMIN activos —
        // mismo conjunto de destinatarios que onIncidentCreated. Si no se
        // hace esto, el cliente cree haber comunicado algo y la incidencia
        // se queda muda hasta que alguien la "tome" por su cuenta.
        const recipients = await prisma.user.findMany({
          where: { role: { in: ["AGENT", "ADMIN"] }, isActive: true },
          select: { email: true },
        });
        await Promise.allSettled(
          recipients.map((r) =>
            sendEmail({ to: r.email, ...emailData })
          )
        );
      }
    } else {
      // Agente/admin escribe: notificar al cliente creador.
      await sendEmail({ to: incident.createdBy.email, ...emailData });
    }
  }

  static async onAssigned(incidentId: string, assignedToId: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        company: { select: { name: true } },
      },
    });
    if (!incident) return;

    const assignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { email: true, isActive: true },
    });
    if (!assignee || !assignee.isActive) return;

    // Reutilizamos la plantilla newMessageNotification con un preview
    // descriptivo en vez de crear una plantilla nueva por una sola línea.
    const emailData = newMessageNotification({
      reference: incident.reference,
      subject: incident.subject,
      authorName: "Sistema",
      preview: `Te han asignado la incidencia de ${incident.company.name}.`,
      incidentId: incident.id,
    });

    await sendEmail({ to: assignee.email, ...emailData });
  }

  static async onStatusChanged(incidentId: string, newStatus: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        createdBy: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
    });
    if (!incident) return;

    const emailData = statusChangedNotification({
      reference: incident.reference,
      subject: incident.subject,
      newStatus,
      incidentId: incident.id,
    });

    await sendEmail({ to: incident.createdBy.email, ...emailData });

    if (incident.assignedTo) {
      await sendEmail({ to: incident.assignedTo.email, ...emailData });
    }
  }
}
