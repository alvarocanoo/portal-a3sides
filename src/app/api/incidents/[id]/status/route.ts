import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/api";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { NotificationService } from "@/services/notification.service";
import { updateIncidentStatusSchema } from "@/lib/validators/incident";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await authorizeApi();
    if (!authz.ok) return authz.response;
    const { session } = authz;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateIncidentStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await IncidentService.changeStatus(
      id,
      parsed.data.status,
      session.user.id,
      session.user.role,
      session.user.companyId,
      parsed.data.reason
    );

    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "incident.status_change",
      userId: session.user.id,
      entityType: "Incident",
      entityId: id,
      metadata: { reference: updated.reference, newStatus: parsed.data.status, reason: parsed.data.reason },
      ipAddress,
      userAgent,
    });

    NotificationService.onStatusChanged(id, parsed.data.status).catch(console.error);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INCIDENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Incidencia no encontrada" },
          { status: 404 }
        );
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
      if (error.message === "INVALID_TRANSITION") {
        return NextResponse.json(
          { error: "Transición de estado no permitida" },
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
