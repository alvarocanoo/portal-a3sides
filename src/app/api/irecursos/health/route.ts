import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHealthStatus } from "@/lib/irecursos/client";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const status = await getHealthStatus();
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Error al verificar conexión" },
      { status: 500 }
    );
  }
}
