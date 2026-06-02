import { ENDPOINTS } from "./endpoints";
import { IRecursosError } from "./errors";
import {
  parseModalClientsTable,
  type ParseResult as ModalClientsParseResult,
} from "./parse-modal-clients";
import type {
  IRecursosSession,
  IRecursosContract,
  XJXResponse,
} from "./types";

const TIMEOUT = parseInt(process.env.IRECURSOS_TIMEOUT_MS || "15000", 10);
const SESSION_TTL = 25 * 60 * 1000;

let cachedSession: IRecursosSession | null = null;
let consecutiveFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN = 5 * 60 * 1000;
let circuitBreakerOpenUntil = 0;

function buildXjxBody(fun: string, args: string[]): string {
  const params = new URLSearchParams();
  params.append("xjxfun", fun);
  args.forEach((arg) => params.append("xjxargs[]", arg));
  params.append("xjxr", Date.now().toString());
  return params.toString();
}

function buildLoginArgs(user: string, password: string): string {
  return (
    `<xjxobj>` +
    `<e><k>userid</k><v>S${user}</v></e>` +
    `<e><k>password</k><v>S<![CDATA[${password}]]></v></e>` +
    `<e><k>empresa</k><v>S</v></e>` +
    `<e><k>hp_check</k><v>S</v></e>` +
    `</xjxobj>`
  );
}

/**
 * Errores SIEMPRE fatales en cualquier respuesta de iRecursos, sea HTML
 * o XJX: PHP exception, sesion caducada, sin permisos, redirect de
 * "cierra sesiones previas". Devuelve mensaje descriptivo o null.
 */
function detectIrecursosFatalError(body: string): string | null {
  if (body.length === 0) return "Respuesta vacia de iRecursos";

  if (body.includes("Fatal error") || body.includes("Uncaught")) {
    const m = body.match(/Uncaught\s+\w+(?:Error)?[^<\n:]*[:\s]*[^<\n]*/);
    return `Error PHP en iRecursos: ${(m?.[0] || "Fatal error").slice(0, 200)}`;
  }

  if (body.includes("caducado") || body.includes("Debe validarse de nuevo")) {
    return "Sesion de iRecursos caducada";
  }

  if (body.includes("No tiene permisos")) {
    return "Sin permisos en iRecursos para esta operacion";
  }

  if (body.includes("tancasessions") && body.includes("redirect")) {
    return "iRecursos pide cerrar sesiones previas del usuario";
  }

  return null;
}

/**
 * Decide qué HTML pasar al parser de modal_clients, según el formato de
 * respuesta de iRecursos. Hipótesis confirmada en prueba real:
 *   - `A-imprimir-llistat-embded.php?mf_format=7` devuelve la TABLA HTML
 *     DIRECTAMENTE, sin envoltorio XJX.
 *   - Salvaguarda: si por cualquier razón viniera envuelta en XJX (otra
 *     URL, cambio del backend), buscamos el CMD MODAL_CLIENTS_TAULA y
 *     usamos su valor.
 *
 * Pre-condición: el caller ya descartó errores fatales con
 * `detectIrecursosFatalError`.
 *
 * Exportada para poder testear el routing sin tocar red ni iRecursos.
 */
export function selectModalClientsHtml(body: string): string {
  const looksLikeXjx = body.includes("<xjx>") || body.includes("<?xml");

  if (looksLikeXjx) {
    const parsed = parseXjxResponse(body);
    const tableCmd = parsed.commands.find(
      (c) => c.id === "MODAL_CLIENTS_TAULA"
    );
    if (!tableCmd?.value) {
      throw new IRecursosError(
        `Respuesta XJX sin MODAL_CLIENTS_TAULA: ${body.slice(0, 120)}`,
        "IRECURSOS_BAD_RESPONSE"
      );
    }
    return tableCmd.value;
  }

  // No es XJX: debe ser HTML directo con una tabla. Aceptamos cualquier
  // <table> — el parser ya valida la estructura interna (tbody, 7 td, etc).
  if (/<table\b/i.test(body)) {
    return body;
  }

  throw new IRecursosError(
    `Respuesta no reconocida (ni XJX ni HTML con tabla): ${body.slice(0, 120)}`,
    "IRECURSOS_BAD_RESPONSE"
  );
}

function parseXjxResponse(xml: string): XJXResponse {
  const commands: XJXResponse["commands"] = [];

  const cmdRegex = /<cmd\s+cmd="(\w+)"(?:\s+id="([^"]*)")?(?:\s+prop="([^"]*)")?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/cmd>/g;
  let match;
  while ((match = cmdRegex.exec(xml)) !== null) {
    const value = (match[4] || "").replace(/^S/, "");
    commands.push({
      cmd: match[1],
      id: match[2] || undefined,
      value,
    });
  }

  const rvMatch = xml.match(/<xjxrv>(.*?)<\/xjxrv>/);
  const success = rvMatch ? rvMatch[1] === "B1" : commands.length > 0;

  return { success, commands, rawXml: xml };
}

function extractCookies(headers: Headers): Partial<IRecursosSession> {
  const result: Partial<IRecursosSession> = {};
  const setCookie = headers.getSetCookie?.() || [];

  for (const cookie of setCookie) {
    if (cookie.startsWith("PHPSESSID=")) {
      result.phpSessionId = cookie.split("=")[1].split(";")[0];
    }
    if (cookie.startsWith("ILEHD_SESSION=")) {
      result.ilehdSession = cookie.split("=")[1].split(";")[0];
    }
  }
  return result;
}

async function fetchWithSession(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  if (Date.now() < circuitBreakerOpenUntil) {
    throw new Error("IRECURSOS_CIRCUIT_OPEN");
  }

  const session = await getSession();
  const cookieHeader = `PHPSESSID=${session.phpSessionId}; ILEHD_SESSION=${session.ilehdSession}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        ...((options.headers as Record<string, string>) || {}),
      },
      signal: controller.signal,
      redirect: "manual",
    });

    consecutiveFailures = 0;
    return res;
  } catch (error) {
    consecutiveFailures++;
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
      console.error(
        `[iRecursos] Circuit breaker OPEN — ${consecutiveFailures} fallos consecutivos`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSession(): Promise<IRecursosSession> {
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession;
  }
  return login();
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function login(): Promise<IRecursosSession> {
  const user = process.env.IRECURSOS_USER;
  const password = process.env.IRECURSOS_PASSWORD;

  if (!user || !password) {
    throw new Error("IRECURSOS_CREDENTIALS_MISSING");
  }

  // Paso 1: GET inicial para obtener cookie de sesion PHP
  const initRes = await fetch(ENDPOINTS.login, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });
  let cookies = extractCookies(initRes.headers);

  // Paso 2: POST XJX a index.php para validar credenciales
  const loginBody = buildXjxBody("ajax_validar", [buildLoginArgs(user, password)]);
  const loginRes = await fetch(ENDPOINTS.login, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      Referer: ENDPOINTS.login,
      Cookie: cookies.phpSessionId ? `PHPSESSID=${cookies.phpSessionId}` : "",
    },
    body: loginBody,
    redirect: "manual",
  });

  const loginXml = await loginRes.text();
  const parsed = parseXjxResponse(loginXml);
  if (!parsed.success) {
    throw new Error("IRECURSOS_LOGIN_FAILED");
  }

  cookies = { ...cookies, ...extractCookies(loginRes.headers) };

  const empresaCmd = parsed.commands.find((c) => c.id === "empresa");
  const empresa = empresaCmd?.value || "A3 SIDES";

  // Paso 3: POST a validar.php con el FORMULARIO COMPLETO para elevar la sesion
  // (no solo empresa — eso era el bug). iRecursos espera userid+password+empresa+hp_check
  // como reenvio del form original, y a cambio establece la cookie ILEHD_SESSION.
  const validateRes = await fetch(ENDPOINTS.validate, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Referer: ENDPOINTS.login,
      Cookie: `PHPSESSID=${cookies.phpSessionId ?? ""}`,
    },
    body: new URLSearchParams({
      userid: user,
      password,
      empresa,
      hp_check: "",
    }).toString(),
    redirect: "manual",
  });

  cookies = { ...cookies, ...extractCookies(validateRes.headers) };

  if (!cookies.phpSessionId || !cookies.ilehdSession) {
    throw new Error("IRECURSOS_SESSION_INCOMPLETE");
  }

  cachedSession = {
    phpSessionId: cookies.phpSessionId,
    ilehdSession: cookies.ilehdSession,
    empresa,
    expiresAt: Date.now() + SESSION_TTL,
  };

  console.log(`[iRecursos] Login OK — empresa: ${empresa}`);
  return cachedSession;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Obtiene los contratos ACTIVOS de un cliente desde el panel de iRecursos.
 * Tolerante: devuelve [] si el cliente no existe, no tiene seccion de contratos,
 * o no tiene contratos activos.
 */
export async function getClientContracts(codcli: string): Promise<IRecursosContract[]> {
  const trimmed = codcli.trim();
  if (!trimmed) return [];

  const url = `${ENDPOINTS.clientPanel}?id=${encodeURIComponent(trimmed)}`;
  const res = await fetchWithSession(url, { method: "GET" });

  // El panel devuelve HTML codificado en ISO-8859-1 (LATIN1).
  // TextDecoder lo convierte correctamente a UTF-8 con acentos, ñ, etc.
  const buffer = await res.arrayBuffer();
  const html = new TextDecoder("iso-8859-1").decode(buffer);

  // Si la sesion no es valida, iRecursos devuelve una pagina pequeña con
  // scripts de redireccion a error.php — sin la seccion del panel.
  if (
    html.length < 1000 ||
    !html.includes("Panel cliente") ||
    html.includes("error.php?msg=No tiene permisos")
  ) {
    return [];
  }

  const sectionMatch = html.match(/id="pcontractes_CONTENT"[\s\S]*?<\/table>/);
  if (!sectionMatch) return [];

  const section = sectionMatch[0];
  const contracts: IRecursosContract[] = [];

  // Cada fila valida del listado tiene class="NEGRE" y 3 td:
  //   1) td con <a href="A-contractes.php?id=N">[referencia o vacio]</a>
  //   2) td con <a href="A-contractes.php?id=N">DESCRIPCION</a>
  //   3) td con clase "text-success" para activo, texto "ACTIVO" o similar
  const rowRegex = /<tr[^>]*class="[^"]*NEGRE[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(section)) !== null) {
    const row = m[1];
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    if (tds.length < 3) continue;

    const [, , refCell] = tds[0];
    const [, , descCell] = tds[1];
    const [, stateAttrs, stateCell] = tds[2];

    // ID: del href de cualquiera de las primeras dos celdas
    const idMatch =
      refCell.match(/A-contractes\.php\?id=(\d+)/) ||
      descCell.match(/A-contractes\.php\?id=(\d+)/);
    const id = idMatch?.[1];
    if (!id) continue;

    // Descripcion: texto interior del <a> de la 2a celda
    const descTextMatch = descCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const description = decodeHtmlEntities(
      (descTextMatch?.[1] || descCell).replace(/<[^>]+>/g, "")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!description) continue;

    // Estado: texto plano + clase CSS
    const stateText = decodeHtmlEntities(stateCell.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    const isActive =
      stateAttrs.includes("text-success") ||
      stateText.toUpperCase() === "ACTIVO";

    if (isActive) {
      contracts.push({ id, description, state: stateText || "ACTIVO" });
    }
  }

  return contracts;
}

/**
 * Pide UNA página del listado paginado de clientes (xajax `modal_clients`).
 *
 * iRecursos pagina de 10 en 10. El total de páginas viene en el footer
 * "Pág. X de N". El parser lo extrae a `totalPages`.
 *
 * REGLA OPERATIVA INNEGOCIABLE: este wrapper NO reintenta. Si la página
 * falla (PHP error, sesión caducada, circuit breaker), lanza y para. La
 * importación masiva la llama dentro de un bucle secuencial con pausas
 * controladas por el orquestador (src/services/bulk-import.service.ts).
 * Esto evita saturar las sesiones concurrentes de iRecursos.
 *
 * Devuelve la estructura tal cual la produce el parser (clients +
 * totalPages + errors). Si hay errores de parsing en filas concretas,
 * los reportamos pero NO lanzamos: la página puede tener filas válidas
 * útiles junto a una malformada.
 */
/**
 * Campos del <form id="form_modal_clients"> que iRecursos espera SIEMPRE
 * en el xjxobj de modal_clients. Capturado del DOM real del modal por el
 * usuario en DevTools.
 *
 * iRecursos NO funciona si solo enviamos `modal_clients_PAGINA` — devuelve
 * HTML degradado sin <tbody>. Hay que mandar el formulario completo con
 * sus valores por defecto. Lo único que cambia entre páginas es PAGINA.
 *
 * Orden importante: respetamos el orden en el que aparecen en el form.
 * Si iRecursos lo procesara posicionalmente (cosa que no parece), un
 * orden distinto rompería; conservarlo es la opción más segura.
 */
const MODAL_CLIENTS_FORM_DEFAULTS: ReadonlyArray<{ k: string; v: string }> = [
  { k: "FILTRE_MODAL_CLIENTS", v: "" },
  { k: "modal_clients_PAGINA", v: "1" }, // sobrescrito por página
  { k: "modal_clients_NUMPAGINES", v: "" },
  { k: "modal_clients_PAGINASEG", v: "" },
  { k: "modal_clients_PAGINAANT", v: "" },
  { k: "modal_clients_REGSXPAG", v: "10" },
  { k: "modal_clients_QUANTS", v: "" },
  { k: "modal_clients_REGINI", v: "" },
  { k: "modal_clients_REGFIN", v: "" },
  { k: "modal_clients_NUMPAG", v: "" },
  { k: "modal_clients_ORD", v: "NOMCLI" },
  { k: "modal_clients_ORDT", v: "" },
  { k: "modal_clients_prefix", v: "" },
  { k: "modal_clients_accio", v: "" },
  { k: "modal_clients_redireccio", v: "" },
  { k: "modal_clients_camp_dirent", v: "" },
  { k: "modal_clients_IDDIRENT", v: "" },
  { k: "modal_clients_capa_resum", v: "" },
  { k: "modal_clients_CCODCLI", v: "CODCLI" },
  { k: "modal_clients_CNOMCLI", v: "NOMCLI" },
  { k: "modal_clients_PROJECTE", v: "" },
  { k: "modal_clients_OT", v: "" },
  { k: "modal_clients_CONTRACTE", v: "" },
];

export const MODAL_CLIENTS_FORM_FIELD_COUNT =
  MODAL_CLIENTS_FORM_DEFAULTS.length;

/**
 * Construye el xjxobj con los 23 campos del formulario modal_clients, con
 * `modal_clients_PAGINA` sobreescrito al número de página solicitado.
 *
 * Cada campo va como `<e><k>nombre</k><v>S{valor}</v></e>`, donde `S` es
 * el prefijo de tipo "string" de xajax. Valores vacíos quedan como
 * `<v>S</v>`. No usamos CDATA porque los valores son ASCII puro (en cuanto
 * tengamos filtros con caracteres especiales, habría que wrapparlos).
 *
 * Pura y exportada para poder testearse sin tocar red.
 */
export function buildModalClientsXjxObj(pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("PAGE_NUMBER_INVALID");
  }
  const entries = MODAL_CLIENTS_FORM_DEFAULTS.map((f) =>
    f.k === "modal_clients_PAGINA"
      ? `<e><k>${f.k}</k><v>S${pageNumber}</v></e>`
      : `<e><k>${f.k}</k><v>S${f.v}</v></e>`
  );
  return `<xjxobj>${entries.join("")}</xjxobj>`;
}

export async function fetchClientsPage(
  pageNumber: number
): Promise<ModalClientsParseResult> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("PAGE_NUMBER_INVALID");
  }

  // El xajax modal_clients lleva DOS xjxargs[] positional:
  //   1) el xjxobj con TODOS los campos del formulario
  //   2) una cadena vacía adicional ("S" = string type prefix sin valor)
  // Esto reproduce lo capturado en DevTools. iRecursos NO funciona con un
  // xjxobj reducido (solo PAGINA): devuelve HTML sin <tbody>.
  const xjxObj = buildModalClientsXjxObj(pageNumber);
  const requestBody = buildXjxBody("modal_clients", [xjxObj, "S"]);

  // mf_format=7 es lo que diferencia este uso de A-imprimir-llistat-embded
  // del listado de OTs. Mismo PHP, distintos modos.
  const url = `${ENDPOINTS.otList}?mf_format=7`;

  const res = await fetchWithSession(url, { method: "POST", body: requestBody });

  // La respuesta puede venir en ISO-8859-1 (lo declara en el header XML
  // cuando es XJX, y los nombres comerciales tienen acentos siempre).
  // Si dejamos res.text() Node asume UTF-8 y rompe ñ/áéíóú.
  const buffer = await res.arrayBuffer();
  const responseBody = new TextDecoder("iso-8859-1").decode(buffer);

  // Errores SIEMPRE fatales (PHP exception, sesión caducada, etc) —
  // aplicables a cualquier formato de respuesta.
  const fatal = detectIrecursosFatalError(responseBody);
  if (fatal) {
    console.error(`[iRecursos fetchClientsPage page=${pageNumber}] ${fatal}`);
    throw new IRecursosError(fatal, "IRECURSOS_BAD_RESPONSE");
  }

  // Routing por formato. Caso esperado: HTML pelado.
  // Salvaguarda: si vienera XJX, también lo manejamos.
  const html = selectModalClientsHtml(responseBody);
  return parseModalClientsTable(html);
}


export async function getHealthStatus(): Promise<{
  connected: boolean;
  empresa: string | null;
  circuitOpen: boolean;
  consecutiveFailures: number;
}> {
  try {
    if (Date.now() < circuitBreakerOpenUntil) {
      return {
        connected: false,
        empresa: null,
        circuitOpen: true,
        consecutiveFailures,
      };
    }

    const session = await getSession();
    return {
      connected: true,
      empresa: session.empresa,
      circuitOpen: false,
      consecutiveFailures: 0,
    };
  } catch {
    return {
      connected: false,
      empresa: null,
      circuitOpen: Date.now() < circuitBreakerOpenUntil,
      consecutiveFailures,
    };
  }
}

export function invalidateSession(): void {
  cachedSession = null;
}

/**
 * Cierra ACTIVAMENTE la sesión en iRecursos. iRecursos limita las sesiones
 * concurrentes por usuario y NO las expira solas en tiempo razonable:
 * si el portal no cierra explícitamente, la sesión queda "fantasma" en
 * el servidor consumiendo un slot del límite. Esto es lo que pasaba
 * antes del fix — `invalidateSession()` solo limpia la cookie en
 * memoria local pero NO le dice a iRecursos que cierre.
 *
 * Diseño:
 *   - Si no hay sesión cacheada, NO HACE NADA (sin sesión no hay nada
 *     que cerrar — y llamar al endpoint con cookies vacías sería ruido).
 *   - GET a ENDPOINTS.logout con las cookies de la sesión actual.
 *   - TOLERANTE A FALLOS: si la llamada falla (red, timeout, iRecursos
 *     caído, lo que sea), se registra con console.error y se SIGUE.
 *     El objetivo es "intentar siempre", NO "fallar la importación si
 *     iRecursos no responde al logout".
 *   - SIEMPRE limpia la cookie cacheada en memoria al final, haya ido
 *     bien o mal — porque cualquier siguiente llamada con esa cookie
 *     probablemente fallaría (ya cerrada o en estado inconsistente).
 */
export async function logoutIRecursos(): Promise<void> {
  if (!cachedSession) {
    // Sin sesión cacheada no hay sesión que cerrar en iRecursos desde
    // este proceso. Silencioso a propósito.
    return;
  }

  const session = cachedSession;
  // Capturamos cookies ANTES de limpiar memoria; el finally limpia.
  const cookieHeader = `PHPSESSID=${session.phpSessionId}; ILEHD_SESSION=${session.ilehdSession}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(ENDPOINTS.logout, {
        method: "GET",
        headers: {
          Cookie: cookieHeader,
          "User-Agent": USER_AGENT,
        },
        redirect: "manual", // logout suele redirigir al login; no la seguimos
        signal: controller.signal,
      });
      // iRecursos devuelve 302 (redirect a index.php) o 200 al hacer
      // logout. Cualquier código <500 lo consideramos "intentado OK".
      const ok = res.status < 500;
      console.log(
        `[iRecursos] Logout ${ok ? "OK" : "respondió " + res.status} — sesión cerrada en servidor`
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Tolerancia: NO propagamos. Solo logueamos para diagnóstico.
    console.error(
      `[iRecursos] Logout falló (red/timeout/etc): ${err instanceof Error ? err.message : String(err)} — la sesión podría quedar abierta en iRecursos hasta su timeout. Limpiando cookie local de todas formas.`
    );
  } finally {
    // Limpiar SIEMPRE la cookie cacheada, fuese cual fuese el resultado
    // de la llamada HTTP. Cualquier reuso de esa cookie a partir de aquí
    // sería incorrecto (sesión cerrada o estado indeterminado).
    invalidateSession();
  }
}
