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
        await sendEmail({ to: incident.assignedTo.email, ...emailData });
      }
    } else {
      await sendEmail({ to: incident.createdBy.email, ...emailData });
    }
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
