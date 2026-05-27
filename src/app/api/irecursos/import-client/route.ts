import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SyncService } from "@/services/sync.service";
import { AuditService } from "@/services/audit.service";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Parámetro 'query' requerido" },
        { status: 400 }
      );
    }

    const result = await SyncService.importClientFromIRecursos(query);

    if (!result) {
      return NextResponse.json(
        { error: "No se encontró el cliente en iRecursos" },
        { status: 404 }
      );
    }

    await AuditService.log({
      action: result.created ? "company.import_irecursos" : "company.import_existing",
      userId: session.user.id,
      entityType: "Company",
      entityId: result.company.id,
      metadata: {
        irecursosCode: result.client.codcli,
        name: result.client.name,
        created: result.created,
      },
    });

    return NextResponse.json({
      company: result.company,
      created: result.created,
      irecursosData: result.client,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "IRECURSOS_CIRCUIT_OPEN") {
        return NextResponse.json(
          { error: "iRecursos no disponible temporalmente" },
          { status: 503 }
        );
      }
      if (error.message === "IRECURSOS_CREDENTIALS_MISSING") {
        return NextResponse.json(
          { error: "Credenciales de iRecursos no configuradas" },
          { status: 500 }
        );
      }
    }
    return NextResponse.json(
      { error: "Error al importar desde iRecursos" },
      { status: 500 }
    );
  }
}
