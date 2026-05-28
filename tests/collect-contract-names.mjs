// Recopila nombres UNICOS de contratos a partir de varios paneles de cliente.
// NO imprime datos personales (nombres, NIFs, telefonos, etc.) — solo el texto
// de la columna "Descripcion" de la tabla CONTRATOS ACTIVOS.
import { readFileSync } from "fs";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.IRECURSOS_BASE_URL;
const USER = process.env.IRECURSOS_USER;
const PASS = process.env.IRECURSOS_PASSWORD;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildXjxBody(fun, args) {
  const p = new URLSearchParams();
  p.append("xjxfun", fun);
  args.forEach((a) => p.append("xjxargs[]", a));
  p.append("xjxr", Date.now().toString());
  return p.toString();
}

function buildLoginArgs(u, pw) {
  return `<xjxobj><e><k>userid</k><v>S${u}</v></e><e><k>password</k><v>S<![CDATA[${pw}]]></v></e><e><k>empresa</k><v>S</v></e><e><k>hp_check</k><v>S</v></e></xjxobj>`;
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

async function loginToIRecursos() {
  const initRes = await fetch(`${BASE}/es/index.php`, {
    method: "GET", headers: { "User-Agent": USER_AGENT }, redirect: "manual",
  });
  let cookies = extractCookies(initRes.headers);

  const loginRes = await fetch(`${BASE}/es/index.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/es/index.php`,
      Cookie: `PHPSESSID=${cookies.php}`,
    },
    body: buildXjxBody("ajax_validar", [buildLoginArgs(USER, PASS)]),
    redirect: "manual",
  });
  if (!(await loginRes.text()).includes("<xjxrv>B1</xjxrv>")) throw new Error("LOGIN_FAIL");
  cookies = { ...cookies, ...extractCookies(loginRes.headers) };

  const validateRes = await fetch(`${BASE}/es/validar.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Referer: `${BASE}/es/index.php`,
      Cookie: `PHPSESSID=${cookies.php}`,
    },
    body: new URLSearchParams({ userid: USER, password: PASS, empresa: "A3 SIDES", hp_check: "" }).toString(),
    redirect: "manual",
  });
  cookies = { ...cookies, ...extractCookies(validateRes.headers) };
  if (!cookies.php || !cookies.ilehd) throw new Error("SESSION_INCOMPLETE");
  return cookies;
}

// Decodifica entidades HTML y resuelve caracteres ISO-8859-1
function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Extrae los nombres de contratos del HTML del panel. Devuelve array de strings (descripciones).
// La tabla esta dentro del div id="pcontractes_CONTENT" con clase CONTRACTES en filas.
function extractContractNames(html) {
  const sectionMatch = html.match(/id="pcontractes_CONTENT"[\s\S]*?<\/table>/);
  if (!sectionMatch) return [];
  const section = sectionMatch[0];
  const names = [];
  // Cada fila CONTRACTES tiene 3 <td>: ref, descripcion, estado
  // La descripcion suele ser el segundo td, dentro de un <a href="A-contractes.php?id=N">TEXTO</a>
  const rowRegex = /<tr[^>]*class="[^"]*NEGRE[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(section)) !== null) {
    const row = m[1];
    // Buscar el segundo <td> (skip ref)
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    if (tds.length >= 2) {
      const descCell = tds[1][1];
      // Extraer texto del link interior
      const linkText = descCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const raw = linkText ? linkText[1] : descCell;
      const clean = decodeHtml(raw.replace(/<[^>]+>/g, "")).trim();
      if (clean) names.push(clean);
    }
  }
  return names;
}

async function fetchPanel(cookies, codcli) {
  const res = await fetch(`${BASE}/es/A-clients-panell.php?id=${codcli}`, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: `PHPSESSID=${cookies.php}; ILEHD_SESSION=${cookies.ilehd}`,
    },
    redirect: "manual",
  });
  if (res.status !== 200) return { ok: false, status: res.status };
  const body = await res.text();
  if (body.length < 1000 || body.includes("error.php") || !body.includes("Panel cliente")) {
    return { ok: false, reason: "no-panel" };
  }
  return { ok: true, names: extractContractNames(body) };
}

const cookies = await loginToIRecursos();
console.log("Login OK. Consultando paneles...\n");

// Conjunto variado de CODCLIs: un rango disperso para diversidad
const codclis = [
  "5412", "5401", "5463",         // Los del mapeo original
  "5400", "5410", "5420", "5430", "5440", "5450", "5460", "5470", "5480",
  "5500", "5550", "5600", "5650",
  "5000", "5100", "5200", "5300",
  "4500", "4700", "4900",
];

const allNames = [];
const stats = { ok: 0, noPanel: 0, noContracts: 0, fail: 0 };

for (const code of codclis) {
  const r = await fetchPanel(cookies, code);
  if (!r.ok) {
    if (r.reason === "no-panel") stats.noPanel++;
    else stats.fail++;
    process.stdout.write(".");
    continue;
  }
  stats.ok++;
  if (r.names.length === 0) {
    stats.noContracts++;
    process.stdout.write("_");
  } else {
    allNames.push(...r.names);
    process.stdout.write("*");
  }
}

console.log("\n\n=== ESTADISTICAS ===");
console.log(`Clientes consultados: ${codclis.length}`);
console.log(`Con panel valido: ${stats.ok}`);
console.log(`Sin panel (CODCLI vacio): ${stats.noPanel}`);
console.log(`Sin contratos activos: ${stats.noContracts}`);
console.log(`Errores: ${stats.fail}`);

// Deduplicar y ordenar alfabeticamente
const unique = [...new Set(allNames.map((n) => n.toUpperCase()))].sort();

console.log(`\n=== NOMBRES UNICOS DE CONTRATO (${unique.length}) ===`);
unique.forEach((n) => console.log(`  ${n}`));
