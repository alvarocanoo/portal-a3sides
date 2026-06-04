import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/api";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { NotificationService } from "@/services/notification.service";
import { assignIncidentSchema } from "@/lib/validators/incident";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await authorizeApi({ roles: ["AGENT", "ADMIN"] });
    if (!authz.ok) return authz.response;
    const { session } = authz;

    const { id } = await params;
    const body = await request.json();
    const parsed = assignIncidentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await IncidentService.assign(
      id,
      parsed.data.assignedToId,
      session.user.role,
      session.user.id
    );

    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "incident.assign",
      userId: session.user.id,
      entityType: "Incident",
      entityId: id,
      metadata: { reference: updated.reference, assignedToId: parsed.data.assignedToId },
      ipAddress,
      userAgent,
    });

    // Notificar al nuevo asignado (fire-and-forget). No se hace si el
    // asignado es el propio usuario que ejecuta la acción (auto-asignación,
    // no necesita avisarse a sí mismo).
    if (parsed.data.assignedToId !== session.user.id) {
      NotificationService.onAssigned(id, parsed.data.assignedToId).catch(
        console.error
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
      if (error.message === "INVALID_AGENT") {
        return NextResponse.json(
          { error: "Agente inválido" },
          { status: 400 }
        );
      }
      if (error.message === "INCIDENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Incidencia no encontrada" },
          { status: 404 }
        );
      }
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
