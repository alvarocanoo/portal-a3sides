// Exploracion del panel de cliente en iRecursos
// NO guarda la respuesta en disco — solo imprime por consola
import "dotenv/config";
import { readFileSync } from "fs";

// Cargar .env.local manualmente (dotenv solo lee .env)
const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.IRECURSOS_BASE_URL;
const USER = process.env.IRECURSOS_USER;
const PASS = process.env.IRECURSOS_PASSWORD;
const CODCLI = process.argv[2];

if (!USER || !PASS) {
  console.error("Faltan IRECURSOS_USER o IRECURSOS_PASSWORD");
  process.exit(1);
}
if (!CODCLI) {
  console.error("Uso: node explore-client-panel.mjs <CODCLI>");
  process.exit(1);
}

function buildXjxBody(fun, args) {
  const p = new URLSearchParams();
  p.append("xjxfun", fun);
  args.forEach((a) => p.append("xjxargs[]", a));
  p.append("xjxr", Date.now().toString());
  return p.toString();
}

function buildLoginArgs(user, pw) {
  return (
    `<xjxobj>` +
    `<e><k>userid</k><v>S${user}</v></e>` +
    `<e><k>password</k><v>S<![CDATA[${pw}]]></v></e>` +
    `<e><k>empresa</k><v>S</v></e>` +
    `<e><k>hp_check</k><v>S</v></e>` +
    `</xjxobj>`
  );
}

function extractCookies(headers) {
  const result = {};
  const setCookie = headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    if (c.startsWith("PHPSESSID=")) result.php = c.split("=")[1].split(";")[0];
    if (c.startsWith("ILEHD_SESSION=")) result.ilehd = c.split("=")[1].split(";")[0];
  }
  return result;
}

console.log(`\n=== PASO 0: GET index.php para obtener cookie inicial ===`);
const initRes = await fetch(`${BASE}/es/index.php`, {
  method: "GET",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
  redirect: "manual",
});
const initCookies = extractCookies(initRes.headers);
console.log(`Status: ${initRes.status} | PHPSESSID inicial: ${initCookies.php ? "OK" : "MISSING"}`);

console.log(`\n=== PASO 1: Login a ${BASE}/es/index.php ===`);
console.log(`Usuario: ${USER} | Password length: ${PASS.length}`);
const loginBody = buildXjxBody("ajax_validar", [buildLoginArgs(USER, PASS)]);
const loginRes = await fetch(`${BASE}/es/index.php`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/xml, text/xml, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `${BASE}/es/index.php`,
    Cookie: initCookies.php ? `PHPSESSID=${initCookies.php}` : "",
  },
  body: loginBody,
  redirect: "manual",
});
console.log(`Status: ${loginRes.status}`);
const loginXml = await loginRes.text();
console.log(`Respuesta login (primeros 500 chars):\n${loginXml.slice(0, 500)}`);

const empresaMatch = loginXml.match(/id="empresa"[^>]*>S([^<]+)/);
const empresa = empresaMatch?.[1]?.trim() || "A3 SIDES";
console.log(`Empresa detectada: ${empresa}`);

// Mantenemos PHPSESSID del PASO 0 (la sesion se "eleva" server-side tras login)
let cookies = { ...initCookies, ...extractCookies(loginRes.headers) };
console.log(`Cookies tras login: PHPSESSID=${cookies.php ? "OK" : "MISSING"}, ILEHD=${cookies.ilehd ? "OK" : "MISSING"}`);

console.log(`\n=== PASO 2: Re-submit form completo a validar.php ===`);
const validateRes = await fetch(`${BASE}/es/validar.php`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": `${BASE}/es/index.php`,
    Cookie: `PHPSESSID=${cookies.php}`,
  },
  body: new URLSearchParams({
    userid: USER,
    password: PASS,
    empresa: empresa,
    hp_check: "",
  }).toString(),
  redirect: "manual",
});
console.log(`Status: ${validateRes.status}`);
console.log(`Location header: ${validateRes.headers.get("location") || "(none)"}`);
cookies = { ...cookies, ...extractCookies(validateRes.headers) };
console.log(`Cookies tras validar: PHPSESSID=${cookies.php ? "OK" : "MISSING"}, ILEHD=${cookies.ilehd ? "OK" : "MISSING"}`);

console.log(`\n=== PASO 3: GET A-clients-panell.php?id=${CODCLI} ===`);
const panelUrl = `${BASE}/es/A-clients-panell.php?id=${CODCLI}`;
const cookieStr = `PHPSESSID=${cookies.php}${cookies.ilehd ? `; ILEHD_SESSION=${cookies.ilehd}` : ""}`;
const panelRes = await fetch(panelUrl, {
  method: "GET",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Cookie: cookieStr,
  },
  redirect: "manual",
});
console.log(`Status: ${panelRes.status}`);
console.log(`Content-Type: ${panelRes.headers.get("content-type")}`);
console.log(`Content-Length: ${panelRes.headers.get("content-length") || "no header"}`);

const body = await panelRes.text();
console.log(`Tamano respuesta: ${body.length} chars\n`);

console.log("=== RESPUESTA COMPLETA ===");
console.log(body);
console.log("\n=== FIN RESPUESTA ===");
