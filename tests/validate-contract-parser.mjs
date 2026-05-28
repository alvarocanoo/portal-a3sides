// Valida el parser de contratos contra casos variados.
// NO imprime datos personales — solo nombres de contratos y recuentos.
import { readFileSync } from "fs";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.IRECURSOS_BASE_URL;
const USER = process.env.IRECURSOS_USER;
const PASS = process.env.IRECURSOS_PASSWORD;
const UA =
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
  for (const c of headers.getSetCookie?.() || []) {
    if (c.startsWith("PHPSESSID=")) result.php = c.split("=")[1].split(";")[0];
    if (c.startsWith("ILEHD_SESSION=")) result.ilehd = c.split("=")[1].split(";")[0];
  }
  return result;
}
function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function login() {
  const init = await fetch(`${BASE}/es/index.php`, { headers: { "User-Agent": UA }, redirect: "manual" });
  let cookies = extractCookies(init.headers);
  const xjx = await fetch(`${BASE}/es/index.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/es/index.php`,
      Cookie: `PHPSESSID=${cookies.php}`,
    },
    body: buildXjxBody("ajax_validar", [buildLoginArgs(USER, PASS)]),
    redirect: "manual",
  });
  if (!(await xjx.text()).includes("<xjxrv>B1</xjxrv>")) throw new Error("LOGIN_FAIL");
  cookies = { ...cookies, ...extractCookies(xjx.headers) };
  const val = await fetch(`${BASE}/es/validar.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Referer: `${BASE}/es/index.php`,
      Cookie: `PHPSESSID=${cookies.php}`,
    },
    body: new URLSearchParams({ userid: USER, password: PASS, empresa: "A3 SIDES", hp_check: "" }).toString(),
    redirect: "manual",
  });
  cookies = { ...cookies, ...extractCookies(val.headers) };
  if (!cookies.php || !cookies.ilehd) throw new Error("SESSION_INCOMPLETE");
  return cookies;
}

// Reproduce EXACTAMENTE el parser de client.ts (sin importar TS desde mjs).
// Devuelve {contracts, stats} para diagnostico.
function parsePanel(html) {
  if (
    html.length < 1000 ||
    !html.includes("Panel cliente") ||
    html.includes("error.php?msg=No tiene permisos")
  ) {
    return { contracts: [], stats: { reason: "no-panel" } };
  }
  const sectionMatch = html.match(/id="pcontractes_CONTENT"[\s\S]*?<\/table>/);
  if (!sectionMatch) return { contracts: [], stats: { reason: "no-section" } };

  const contracts = [];
  let totalRows = 0;
  let rejectedNoId = 0;
  let rejectedInactive = 0;
  let refEmpty = 0;
  let refFilled = 0;

  const rowRegex = /<tr[^>]*class="[^"]*NEGRE[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(sectionMatch[0])) !== null) {
    totalRows++;
    const row = m[1];
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    if (tds.length < 3) continue;

    const refCell = tds[0][2];
    const descCell = tds[1][2];
    const stateAttrs = tds[2][1];
    const stateCell = tds[2][2];

    const idMatch =
      refCell.match(/A-contractes\.php\?id=(\d+)/) ||
      descCell.match(/A-contractes\.php\?id=(\d+)/);
    const id = idMatch?.[1];
    if (!id) {
      rejectedNoId++;
      continue;
    }

    // Texto de la celda de referencia (antes de eliminar HTML)
    const refText = decodeHtmlEntities(refCell.replace(/<[^>]+>/g, "")).trim();
    if (refText) refFilled++;
    else refEmpty++;

    const descTextMatch = descCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const description = decodeHtmlEntities(
      (descTextMatch?.[1] || descCell).replace(/<[^>]+>/g, "")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!description) continue;

    const stateText = decodeHtmlEntities(stateCell.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    const isActive =
      stateAttrs.includes("text-success") || stateText.toUpperCase() === "ACTIVO";

    if (!isActive) {
      rejectedInactive++;
      continue;
    }
    contracts.push({ id, description, state: stateText || "ACTIVO" });
  }
  return {
    contracts,
    stats: { totalRows, rejectedNoId, rejectedInactive, refEmpty, refFilled },
  };
}

async function fetchPanel(cookies, codcli) {
  const res = await fetch(`${BASE}/es/A-clients-panell.php?id=${codcli}`, {
    headers: {
      "User-Agent": UA,
      Cookie: `PHPSESSID=${cookies.php}; ILEHD_SESSION=${cookies.ilehd}`,
    },
    redirect: "manual",
  });
  if (res.status !== 200) return null;
  const buffer = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buffer);
}

const cookies = await login();
console.log("Login OK. Validando parser sobre muestra amplia...\n");

// Rango amplio para encontrar variedad
const codclis = [];
for (let i = 4500; i <= 5700; i += 25) codclis.push(String(i));
for (const c of ["5412", "5401", "5463"]) if (!codclis.includes(c)) codclis.push(c);

const aggregate = {
  panelsConsulted: 0,
  panelsValid: 0,
  panelsWithContracts: 0,
  panelsWithSingleContract: 0,
  panelsWithMultiContracts: 0,
  panelsWithoutContracts: 0,
  totalContracts: 0,
  totalRejectedInactive: 0,
  totalRefEmpty: 0,
  totalRefFilled: 0,
  contractsWithAccents: new Set(),
  contractsWithSpecialChars: new Set(),
  contractCountDistribution: {},
  uniqueNames: new Set(),
};

for (const code of codclis) {
  aggregate.panelsConsulted++;
  const html = await fetchPanel(cookies, code);
  if (!html) continue;

  const { contracts, stats } = parsePanel(html);
  if (stats.reason === "no-panel") continue;
  aggregate.panelsValid++;

  if (contracts.length === 0) {
    aggregate.panelsWithoutContracts++;
  } else {
    aggregate.panelsWithContracts++;
    if (contracts.length === 1) aggregate.panelsWithSingleContract++;
    else aggregate.panelsWithMultiContracts++;
    aggregate.totalContracts += contracts.length;
    aggregate.contractCountDistribution[contracts.length] =
      (aggregate.contractCountDistribution[contracts.length] || 0) + 1;

    for (const c of contracts) {
      aggregate.uniqueNames.add(c.description.toUpperCase());
      if (/[áéíóúñÁÉÍÓÚÑ]/.test(c.description)) {
        aggregate.contractsWithAccents.add(c.description);
      }
      if (/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ\s\-_.]/.test(c.description)) {
        aggregate.contractsWithSpecialChars.add(c.description);
      }
    }
  }
  aggregate.totalRejectedInactive += stats.rejectedInactive || 0;
  aggregate.totalRefEmpty += stats.refEmpty || 0;
  aggregate.totalRefFilled += stats.refFilled || 0;
}

console.log("=== RESUMEN ===");
console.log(`Paneles consultados: ${aggregate.panelsConsulted}`);
console.log(`Paneles validos (cliente existe): ${aggregate.panelsValid}`);
console.log(`Con al menos 1 contrato activo: ${aggregate.panelsWithContracts}`);
console.log(`  - Con 1 contrato: ${aggregate.panelsWithSingleContract}`);
console.log(`  - Con varios contratos: ${aggregate.panelsWithMultiContracts}`);
console.log(`Sin contratos activos: ${aggregate.panelsWithoutContracts}`);
console.log(`Total contratos extraidos: ${aggregate.totalContracts}`);
console.log("");
console.log("=== DISTRIBUCION POR NUM CONTRATOS ===");
for (const [count, n] of Object.entries(aggregate.contractCountDistribution).sort((a, b) => +a[0] - +b[0])) {
  console.log(`  ${count} contrato(s): ${n} clientes`);
}
console.log("");
console.log("=== FILTRADO ===");
console.log(`Filas rechazadas por no-activo: ${aggregate.totalRejectedInactive}`);
console.log(`Celdas Referencia vacias: ${aggregate.totalRefEmpty}`);
console.log(`Celdas Referencia rellenas: ${aggregate.totalRefFilled}`);
console.log("");
console.log("=== CARACTERES ESPECIALES ===");
console.log(`Nombres con tildes/ñ: ${aggregate.contractsWithAccents.size}`);
if (aggregate.contractsWithAccents.size > 0) {
  [...aggregate.contractsWithAccents].forEach((n) => console.log(`  - "${n}"`));
}
console.log(`Nombres con otros caracteres especiales: ${aggregate.contractsWithSpecialChars.size}`);
if (aggregate.contractsWithSpecialChars.size > 0) {
  [...aggregate.contractsWithSpecialChars].forEach((n) => console.log(`  - "${n}"`));
}
console.log("");
console.log(`=== NOMBRES UNICOS (${aggregate.uniqueNames.size}) ===`);
[...aggregate.uniqueNames].sort().forEach((n) => console.log(`  ${n}`));
