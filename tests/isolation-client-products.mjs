// Test de aislamiento del endpoint /api/irecursos/client-products
// Verifica que un CLIENT no puede consultar contratos de otra empresa
// manipulando el parametro CODCLI.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";

async function getSession(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  return [
    ...cookies.split("; "),
    ...loginRes.headers.getSetCookie().map(c => c.split(";")[0]),
  ].join("; ");
}

async function call(path, cookies) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookies },
    redirect: "manual",
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function pass(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}`);
  if (!cond) process.exitCode = 1;
}

// ── Setup: vincular la empresa demo a un CODCLI real (5412) ──
const demoCompany = await prisma.company.findUnique({
  where: { irecursosClientId: "TEST-001" },
});
if (!demoCompany) {
  console.error("No existe la empresa demo (TEST-001). Ejecuta el seed.");
  process.exit(1);
}
const originalCodcli = demoCompany.irecursosClientId;
console.log(`Empresa demo encontrada. Vinculando temporalmente a CODCLI=5412...\n`);
await prisma.company.update({
  where: { id: demoCompany.id },
  data: { irecursosClientId: "5412" },
});

try {
  console.log("Obteniendo sesiones...");
  const clientCookies = await getSession("cliente@demo.com", "Cliente123!");
  const agentCookies = await getSession("agente@a3sides.es", "Agente123!");
  const adminCookies = await getSession("admin@a3sides.es", "Admin123!");
  console.log("3 sesiones OK.\n");

  // ── Test 1: CLIENT sin parametros → obtiene contratos de SU empresa (5412) ──
  console.log("── CLIENT sin parametros: ¿obtiene los contratos de su empresa? ──");
  const r1 = await call("/api/irecursos/client-products", clientCookies);
  pass("Status 200", r1.status === 200);
  pass("source = irecursos", r1.data?.source === "irecursos");
  pass("Hay al menos 1 contrato (CODCLI=5412 tiene 2)", (r1.data?.contracts?.length || 0) >= 1);
  // Sin imprimir nombres exactos (datos del cliente real)
  console.log(`  Numero de contratos obtenidos: ${r1.data?.contracts?.length || 0}`);

  // ── Test 2: CLIENT pasando CODCLI ajeno → debe IGNORAR el parametro ──
  // Cliente intenta forzar otro CODCLI (5401, 5463, 9999...)
  console.log("\n── CLIENT manipulando URL con otros CODCLI ──");
  for (const target of ["5401", "5463", "9999", "..*", "../admin"]) {
    const r = await call(
      `/api/irecursos/client-products?codcli=${encodeURIComponent(target)}`,
      clientCookies
    );
    const sameContracts =
      JSON.stringify(r.data?.contracts) === JSON.stringify(r1.data?.contracts);
    pass(
      `CLIENT con codcli=${target}: respuesta IDENTICA a su consulta natural`,
      sameContracts && r.status === 200
    );
  }

  // ── Test 3: CLIENT sin company.irecursosClientId → fallback ──
  console.log("\n── CLIENT sin empresa vinculada a iRecursos ──");
  await prisma.company.update({
    where: { id: demoCompany.id },
    data: { irecursosClientId: null },
  });
  const r3 = await call("/api/irecursos/client-products", clientCookies);
  pass("source = fallback", r3.data?.source === "fallback");
  pass("reason = no-irecursos-link", r3.data?.reason === "no-irecursos-link");
  pass("contracts vacios", Array.isArray(r3.data?.contracts) && r3.data.contracts.length === 0);
  // CLIENT con codcli en URL aun sin empresa vinculada: tampoco debe consultar
  const r3b = await call("/api/irecursos/client-products?codcli=5412", clientCookies);
  pass(
    "CLIENT sin vinculo + codcli=5412 en URL → sigue fallback (no consulta iRecursos)",
    r3b.data?.source === "fallback" && r3b.data?.reason === "no-irecursos-link"
  );

  // Restaurar
  await prisma.company.update({
    where: { id: demoCompany.id },
    data: { irecursosClientId: "5412" },
  });

  // ── Test 4: AGENT con codcli=5412 → obtiene contratos ──
  console.log("\n── AGENT y ADMIN: acceso libre con parametro CODCLI ──");
  const r4 = await call("/api/irecursos/client-products?codcli=5412", agentCookies);
  pass("AGENT con codcli=5412: status 200", r4.status === 200);
  pass("AGENT obtiene contratos de iRecursos", r4.data?.source === "irecursos");

  const r5 = await call("/api/irecursos/client-products?codcli=5412", adminCookies);
  pass("ADMIN con codcli=5412: status 200", r5.status === 200);
  pass("ADMIN obtiene contratos de iRecursos", r5.data?.source === "irecursos");

  // ── Test 5: AGENT/ADMIN sin codcli → 400 ──
  const r6 = await call("/api/irecursos/client-products", agentCookies);
  pass("AGENT sin codcli: 400 Bad Request", r6.status === 400);

  const r7 = await call("/api/irecursos/client-products", adminCookies);
  pass("ADMIN sin codcli: 400 Bad Request", r7.status === 400);

  // ── Test 6: Sin auth → 401 ──
  console.log("\n── Sin autenticar ──");
  const r8 = await call("/api/irecursos/client-products", "");
  pass("Sin auth: 401", r8.status === 401);
  const r9 = await call("/api/irecursos/client-products?codcli=5412", "");
  pass("Sin auth + codcli: 401", r9.status === 401);
} finally {
  // Restaurar SIEMPRE el irecursosClientId original
  await prisma.company.update({
    where: { id: demoCompany.id },
    data: { irecursosClientId: originalCodcli },
  });
  console.log(`\nempresa demo restaurada a irecursosClientId=${originalCodcli}`);
  await prisma.$disconnect();
}
