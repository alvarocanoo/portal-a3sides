/**
 * Wrapper de fetch que detecta 401 (sesión expirada) y dispara un evento
 * global "session-expired". Un componente montado en el layout del portal
 * (SessionExpiredModal) lo escucha y muestra un modal redirigiendo al login.
 *
 * Uso: igual que fetch — `apiFetch(url, options)`. Para endpoints donde el
 * 401 NO significa "sesión expirada" (p.ej. el propio login con credenciales
 * inválidas), seguir usando fetch directamente.
 */

const SESSION_EXPIRED_EVENT = "portal:session-expired";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
  return res;
}

export { SESSION_EXPIRED_EVENT };
