// Lee la IP y el user-agent reales del request entrante para el audit log.
//
// Pensado para correr detrás del reverse proxy del despliegue (Caddy en
// este proyecto), que coloca la IP del cliente original en `x-forwarded-for`.
// Si no hay proxy delante (uso local directo, tests sintéticos) cae a
// `x-real-ip` y luego a undefined — nunca string vacío, para que el campo
// en BD quede NULL en lugar de "".
//
// SEGURIDAD: x-forwarded-for y x-real-ip son cabeceras que el cliente
// puede falsear si llega directo al server. En este despliegue, Caddy
// SIEMPRE sobreescribe x-forwarded-for con la IP real, así que es de
// confianza aquí. Si en el futuro se expone el server sin reverse proxy
// de confianza delante, hay que revisar esta hipótesis.
export function getRequestContext(request: Request): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const headers = request.headers;

  // x-forwarded-for puede venir como "ip1, ip2, ip3" cuando hay varios
  // proxies en cadena. La PRIMERA es la del cliente original; el resto
  // son saltos intermedios.
  const xff = headers.get("x-forwarded-for");
  const firstXff = xff?.split(",")[0]?.trim();

  const xRealIp = headers.get("x-real-ip")?.trim();

  // `|| undefined` (no `|| ""`) garantiza que un valor ausente o vacío se
  // guarda como NULL en BD, coherente con `String?` en el schema Prisma.
  const ipAddress = firstXff || xRealIp || undefined;

  const ua = headers.get("user-agent")?.trim();
  const userAgent = ua || undefined;

  return { ipAddress, userAgent };
}
