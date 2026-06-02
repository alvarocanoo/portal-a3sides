import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClientContracts } from "@/lib/irecursos/client";
import {
  CONTRACTS_CACHE_TTL_MS,
  isCacheValid,
  parseCachedContracts,
} from "@/lib/irecursos/contracts-cache";
import type { IRecursosContract } from "@/lib/irecursos/types";

type FallbackReason =
  | "no-company"
  | "no-irecursos-link"
  | "no-contracts"
  | "irecursos-error";

function fallback(reason: FallbackReason) {
  return NextResponse.json({ source: "fallback" as const, reason, contracts: [] });
}

function fresh(contracts: IRecursosContract[]) {
  return NextResponse.json({
    source: "irecursos" as const,
    contracts,
  });
}

function fromCache(contracts: IRecursosContract[], cachedAt: Date) {
  return NextResponse.json({
    source: "cache" as const,
    cachedAt: cachedAt.toISOString(),
    contracts,
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // ── Resolución del CODCLI ───────────────────────────────────────────
  // CLIENT: SIEMPRE viene del servidor (de su empresa autenticada). Nunca
  //          se acepta del query — eso permitiría leer empresas ajenas.
  // AGENT/ADMIN: del query (?codcli=...).
  // ──────────────────────────────────────────────────────────────────
  let codcli: string | null = null;
  let companyForCache: { id: string; cachedContracts: unknown; cachedContractsAt: Date | null } | null = null;

  if (session.user.role === "CLIENT") {
    if (!session.user.companyId) return fallback("no-company");

    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: {
        id: true,
        irecursosClientId: true,
        cachedContracts: true,
        cachedContractsAt: true,
      },
    });
    if (!company?.irecursosClientId) return fallback("no-irecursos-link");

    codcli = company.irecursosClientId;
    companyForCache = {
      id: company.id,
      cachedContracts: company.cachedContracts,
      cachedContractsAt: company.cachedContractsAt,
    };
  } else {
    const { searchParams } = new URL(request.url);
    codcli = searchParams.get("codcli");
    if (!codcli) {
      return NextResponse.json(
        { error: "Parametro 'codcli' requerido para AGENT/ADMIN" },
        { status: 400 }
      );
    }

    // Para AGENT/ADMIN también aprovechamos el cache si el codcli mapea a
    // una empresa conocida. Si no, vamos directo a iRecursos sin cachear.
    const company = await prisma.company.findUnique({
      where: { irecursosClientId: codcli },
      select: {
        id: true,
        cachedContracts: true,
        cachedContractsAt: true,
      },
    });
    if (company) {
      companyForCache = company;
    }
  }

  // ── Hit de cache ────────────────────────────────────────────────────
  if (companyForCache && isCacheValid(companyForCache.cachedContractsAt)) {
    const cached = parseCachedContracts(companyForCache.cachedContracts);
    if (cached !== null) {
      // Cache válido y bien formado: devolvemos SIN llamar a iRecursos.
      // Esta es la rama crítica que reduce la presión sobre iRecursos.
      return fromCache(cached, companyForCache.cachedContractsAt!);
    }
    // Cache corrupto (versión vieja o tampered): caemos a llamar iRecursos.
  }

  // ── Miss / cache expirado → llamar iRecursos ────────────────────────
  try {
    const contracts = await getClientContracts(codcli);
    if (contracts.length === 0) {
      // No cacheamos resultados vacíos: si la empresa estaba mal vinculada
      // y luego se arregla, no queremos servir cache vacío durante 30 min.
      return fallback("no-contracts");
    }

    // Refrescar cache si conocemos la empresa
    if (companyForCache) {
      await prisma.company.update({
        where: { id: companyForCache.id },
        data: {
          // Cast a JSON serializable — Prisma exige JsonValue, no acepta
          // tipos custom directamente. parseCachedContracts() valida la
          // forma al leer, así que es seguro guardar tal cual.
          cachedContracts: JSON.parse(JSON.stringify(contracts)),
          cachedContractsAt: new Date(),
        },
      });
    }

    return fresh(contracts);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error(`[client-products] iRecursos error: ${code}`);

    // Degradación: si tenemos cache aunque sea CADUCADO, lo usamos antes
    // que el fallback estático — datos viejos reales > placeholder vacío.
    // Solo se activa cuando iRecursos falla; con iRecursos sano el TTL
    // de 30 min ya lo refresca a tiempo.
    if (companyForCache?.cachedContractsAt) {
      const stale = parseCachedContracts(companyForCache.cachedContracts);
      if (stale !== null && stale.length > 0) {
        console.warn(
          `[client-products] iRecursos caído: sirviendo cache caducado (cachedAt=${companyForCache.cachedContractsAt.toISOString()})`
        );
        return fromCache(stale, companyForCache.cachedContractsAt);
      }
    }

    return fallback("irecursos-error");
  }
}
