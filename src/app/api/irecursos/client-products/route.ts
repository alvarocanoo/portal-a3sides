import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClientContracts } from "@/lib/irecursos/client";

type FallbackReason =
  | "no-company"
  | "no-irecursos-link"
  | "no-contracts"
  | "irecursos-error";

function fallback(reason: FallbackReason) {
  return NextResponse.json({ source: "fallback" as const, reason, contracts: [] });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let codcli: string | null = null;

  if (session.user.role === "CLIENT") {
    // ─── SEGURIDAD INNEGOCIABLE ──────────────────────────────────────
    // El CODCLI se obtiene SIEMPRE del servidor, desde la empresa del
    // usuario autenticado. Cualquier parametro 'codcli' que envie el
    // cliente se IGNORA. Esto impide que un cliente consulte contratos
    // de otra empresa manipulando la URL.
    // ───────────────────────────────────────────────────────────────
    if (!session.user.companyId) return fallback("no-company");

    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: { irecursosClientId: true },
    });
    if (!company?.irecursosClientId) return fallback("no-irecursos-link");

    codcli = company.irecursosClientId;
  } else {
    // AGENT / ADMIN: pueden consultar cualquier CODCLI por parametro
    const { searchParams } = new URL(request.url);
    codcli = searchParams.get("codcli");
    if (!codcli) {
      return NextResponse.json(
        { error: "Parametro 'codcli' requerido para AGENT/ADMIN" },
        { status: 400 }
      );
    }
  }

  try {
    const contracts = await getClientContracts(codcli);
    if (contracts.length === 0) return fallback("no-contracts");
    return NextResponse.json({ source: "irecursos" as const, contracts });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error(`[client-products] iRecursos error: ${code}`);
    return fallback("irecursos-error");
  }
}
