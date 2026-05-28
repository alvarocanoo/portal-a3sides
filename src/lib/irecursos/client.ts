import { ENDPOINTS } from "./endpoints";
import type {
  IRecursosSession,
  IRecursosClient,
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

export async function searchClient(query: string): Promise<IRecursosClient[]> {
  const body = buildXjxBody("clients_accio", [`S${query}`]);

  const res = await fetchWithSession(ENDPOINTS.clientSearch, {
    method: "POST",
    body,
  });

  const xml = await res.text();
  const parsed = parseXjxResponse(xml);

  const clients: IRecursosClient[] = [];

  const htmlCmd = parsed.commands.find((c) => c.id === "codcli_resum");
  if (htmlCmd?.value) {
    const codcliMatch = parsed.commands.find((c) => c.id === "CODCLI");
    const nomcliMatch = parsed.commands.find((c) => c.id === "NOMCLI");

    if (codcliMatch && nomcliMatch) {
      const html = htmlCmd.value;
      const nifMatch = html.match(/NIF\/CIF:<\/span>\s*([^\s<]+)/);
      const phoneMatch = html.match(/TELÉFONO:<\/span>\s*([^\s<]+)/i) ||
        html.match(/TELÃ‰FONO:<\/span>\s*([^\s<]+)/);
      const emailMatch = html.match(/EMAIL:<\/span>\s*([^\s<]+)/);
      const addressMatch = html.match(/DIRECCIÓN:<\/span>\s*([^<]+)/i) ||
        html.match(/DIRECCIÃ"N:<\/span>\s*([^<]+)/);

      clients.push({
        codcli: codcliMatch.value?.replace(/^S/, "").trim() || "",
        name: nomcliMatch.value?.replace(/^S/, "").trim() || "",
        nif: nifMatch?.[1]?.trim() || "",
        phone: phoneMatch?.[1]?.trim() || "",
        email: emailMatch?.[1]?.trim() || "",
        address: addressMatch?.[1]?.trim() || "",
      });
    }
  }

  return clients;
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

export async function createOT(data: {
  clientCode: string;
  description: string;
  assignedResource?: string;
}): Promise<string | null> {
  const body = buildXjxBody("actualitzahora_pr", [`SNUMEROT`]);

  const res = await fetchWithSession(
    `${ENDPOINTS.otNew}?CODCLI=${encodeURIComponent(data.clientCode)}`,
    { method: "POST", body }
  );

  const xml = await res.text();
  const parsed = parseXjxResponse(xml);

  const idMatch = parsed.rawXml.match(/id=(\d+)/);
  return idMatch?.[1] || null;
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
