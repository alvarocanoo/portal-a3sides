import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/api";
import { IncidentService } from "@/services/incident.service";
import { NotificationService } from "@/services/notification.service";
import { createMessageSchema } from "@/lib/validators/incident";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await authorizeApi();
    if (!authz.ok) return authz.response;
    const { session } = authz;

    const { id } = await params;
    const body = await request.json();
    const parsed = createMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const message = await IncidentService.addMessage(
      id,
      parsed.data.content,
      session.user.id,
      parsed.data.isInternal,
      session.user.role,
      session.user.companyId
    );

    NotificationService.onNewMessage(
      id,
      session.user.id,
      parsed.data.isInternal,
      parsed.data.content
    ).catch(console.error);

    return NextResponse.json(message, { status: 201 });
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
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
