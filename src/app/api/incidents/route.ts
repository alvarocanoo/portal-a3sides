import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { NotificationService } from "@/services/notification.service";
import {
  createIncidentSchema,
  listIncidentsQuerySchema,
} from "@/lib/validators/incident";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = listIncidentsQuerySchema.safeParse(
      Object.fromEntries(searchParams)
    );

    if (!query.success) {
      return NextResponse.json(
        { error: query.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await IncidentService.list({
      ...query.data,
      role: session.user.role,
      companyId: session.user.companyId ?? undefined,
    });

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
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.user.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Solo los clientes pueden crear incidencias" },
        { status: 403 }
      );
    }

    if (!session.user.companyId) {
      return NextResponse.json(
        { error: "El usuario no tiene empresa asignada" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = createIncidentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const incident = await IncidentService.create({
      ...parsed.data,
      companyId: session.user.companyId,
      createdById: session.user.id,
    });

    await AuditService.log({
      action: "incident.create",
      userId: session.user.id,
      entityType: "Incident",
      entityId: incident.id,
      metadata: { reference: incident.reference },
    });

    NotificationService.onIncidentCreated(incident.id).catch(console.error);

    return NextResponse.json(incident, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
