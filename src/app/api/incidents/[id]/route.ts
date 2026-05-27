import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { IncidentService } from "@/services/incident.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;

    const incident = await IncidentService.getById(
      id,
      session.user.role,
      session.user.companyId
    );

    if (!incident) {
      return NextResponse.json(
        { error: "Incidencia no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(incident);
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
