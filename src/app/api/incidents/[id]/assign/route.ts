import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { assignIncidentSchema } from "@/lib/validators/incident";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.user.role === "CLIENT") {
      return NextResponse.json(
        { error: "No tienes permiso" },
        { status: 403 }
      );
    }

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
      session.user.role
    );

    await AuditService.log({
      action: "incident.assign",
      userId: session.user.id,
      entityType: "Incident",
      entityId: id,
      metadata: { reference: updated.reference, assignedToId: parsed.data.assignedToId },
    });

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
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
