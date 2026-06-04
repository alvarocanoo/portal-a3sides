import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authorizeApi } from "@/lib/auth/api";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { NotificationService } from "@/services/notification.service";
import {
  createIncidentSchema,
  listIncidentsQuerySchema,
} from "@/lib/validators/incident";
import {
  expandClientStatusFilter,
  expandStaffStatusFilter,
} from "@/lib/incident-states";

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

    // El `status` del query es un pseudo-valor o un estado real. Lo
    // expandimos según rol:
    //   CLIENT → expandClientStatusFilter (4 etiquetas agrupadas + ALL).
    //   AGENT/ADMIN → expandStaffStatusFilter (estados reales + ALL;
    //     tolera pseudos del CLIENT si llegan por URL compartida → cierra
    //     el bug A2 de HTTP 500).
    // En ambos roles, sin status = Activas (oculta cerradas).
    // CLIENT tampoco ve prioridad: ignoramos cualquier ?priority= que llegue.
    const isClient = session.user.role === "CLIENT";
    const result = await IncidentService.list({
      ...query.data,
      status: isClient
        ? expandClientStatusFilter(query.data.status)
        : expandStaffStatusFilter(query.data.status),
      priority: isClient ? undefined : query.data.priority,
      role: session.user.role,
      companyId: session.user.companyId ?? undefined,
      clientOrder: isClient,
      staffOrder: !isClient,
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
    // authorizeApi() cubre auth + mustChangePassword. El check de rol
    // específico se hace después con su mensaje custom porque "Solo los
    // clientes pueden crear incidencias" es más informativo que el
    // genérico "No autorizado" del helper.
    const authz = await authorizeApi();
    if (!authz.ok) return authz.response;
    const { session } = authz;

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

    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "incident.create",
      userId: session.user.id,
      entityType: "Incident",
      entityId: incident.id,
      metadata: { reference: incident.reference },
      ipAddress,
      userAgent,
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
