/**
 * Hook de instrumentación de Next.js — se ejecuta UNA sola vez al
 * arrancar el proceso del servidor (no por request).
 *
 * Lo usamos como gate de configuración: en producción validamos que
 * las variables de entorno esenciales (AUTH_SECRET real, AUTH_URL
 * pública, SMTP configurado, etc.) estén bien. Si falta algo crítico,
 * el throw aborta el arranque con un mensaje claro indicando qué
 * variable está mal y cómo arreglarlo.
 *
 * En desarrollo NO valida — queremos permitir arrancar con defaults,
 * SMTP en modo consola, AUTH_SECRET placeholder, etc.
 */
export async function register() {
  // Solo en el runtime Node.js (no Edge). La validación usa APIs de
  // Node (path) y solo tiene sentido en el proceso del servidor.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Solo en producción.
  if (process.env.NODE_ENV !== "production") return;

  const { validateProductionEnv } = await import("./lib/env-check");
  validateProductionEnv();
}
