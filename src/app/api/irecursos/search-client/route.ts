import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SyncService } from "@/services/sync.service";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "La búsqueda debe tener al menos 2 caracteres" },
        { status: 400 }
      );
    }

    const clients = await SyncService.searchClientsInIRecursos(query);
    return NextResponse.json(clients);
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
      { error: "Error al buscar en iRecursos" },
      { status: 500 }
    );
  }
}
