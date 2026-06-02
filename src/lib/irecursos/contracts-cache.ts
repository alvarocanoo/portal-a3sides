/**
 * Cache de contratos/productos por empresa para iRecursos.
 *
 * El cache se almacena en la propia fila de Company (campos
 * `cachedContracts` JSON + `cachedContractsAt` DateTime).
 *
 * El objetivo es reducir DRÁSTICAMENTE las llamadas a iRecursos cuando
 * varios clientes de la misma empresa abren el formulario de nueva
 * incidencia: en lugar de una llamada por apertura, una sola cada
 * `CONTRACTS_CACHE_TTL_MS` (por defecto 30 min) por empresa.
 *
 * iRecursos tiene un límite de sesiones concurrentes a nivel de
 * licencia. Saturarlo bloquea el acceso real al portal — pasó en
 * desarrollo. Este cache es la protección operativa.
 */

import type { IRecursosContract } from "./types";

export const CONTRACTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Devuelve true si la marca de tiempo del cache cae dentro del TTL.
 *
 * Aislado en función pura para poder testear la lógica sin tocar iRecursos
 * ni la BD: con `cachedAt` reciente devuelve true, con `cachedAt` antiguo
 * devuelve false, con `cachedAt` null devuelve false.
 *
 * @param cachedAt timestamp del último refresco del cache
 * @param ttlMs    ventana de validez (default: 30 min)
 * @param now      "ahora" inyectable para tests deterministas
 */
export function isCacheValid(
  cachedAt: Date | null | undefined,
  ttlMs: number = CONTRACTS_CACHE_TTL_MS,
  now: number = Date.now()
): boolean {
  if (!cachedAt) return false;
  const age = now - cachedAt.getTime();
  return age >= 0 && age < ttlMs;
}

/**
 * Type guard / sanitizador: convierte el JSON crudo de Prisma a
 * `IRecursosContract[]` validando que tenga la forma esperada. Si el
 * cache estuviera corrupto o de una versión vieja del schema, devuelve
 * null para que el endpoint vuelva a consultar iRecursos.
 */
export function parseCachedContracts(raw: unknown): IRecursosContract[] | null {
  if (!Array.isArray(raw)) return null;
  const result: IRecursosContract[] = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { id?: unknown }).id !== "string" ||
      typeof (item as { description?: unknown }).description !== "string" ||
      typeof (item as { state?: unknown }).state !== "string"
    ) {
      return null;
    }
    const c = item as { id: string; description: string; state: string };
    result.push({ id: c.id, description: c.description, state: c.state });
  }
  return result;
}
