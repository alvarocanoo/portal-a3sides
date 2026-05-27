import { ENDPOINTS } from "./endpoints";
import type { IRecursosSession, IRecursosClient, XJXResponse } from "./types";

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

async function login(): Promise<IRecursosSession> {
  const user = process.env.IRECURSOS_USER;
  const password = process.env.IRECURSOS_PASSWORD;

  if (!user || !password) {
    throw new Error("IRECURSOS_CREDENTIALS_MISSING");
  }

  const loginBody = buildXjxBody("ajax_validar", [buildLoginArgs(user, password)]);

  const loginRes = await fetch(ENDPOINTS.login, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: loginBody,
    redirect: "manual",
  });

  const loginXml = await loginRes.text();
  const parsed = parseXjxResponse(loginXml);

  if (!parsed.success) {
    throw new Error("IRECURSOS_LOGIN_FAILED");
  }

  const empresaCmd = parsed.commands.find((c) => c.id === "empresa");
  const empresa = empresaCmd?.value || "A3 SIDES";

  const cookies = extractCookies(loginRes.headers);

  const validateRes = await fetch(ENDPOINTS.validate, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `PHPSESSID=${cookies.phpSessionId || loginRes.headers.get("set-cookie")?.split("PHPSESSID=")[1]?.split(";")[0]}`,
    },
    body: new URLSearchParams({ empresa }).toString(),
    redirect: "manual",
  });

  const allCookies = {
    ...cookies,
    ...extractCookies(validateRes.headers),
  };

  cachedSession = {
    phpSessionId: allCookies.phpSessionId || "",
    ilehdSession: allCookies.ilehdSession || "",
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
