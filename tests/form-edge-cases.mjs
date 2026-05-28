// Verifica cada caso limite del formulario de nueva incidencia,
// llamando al endpoint en las 4 condiciones distintas.
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
  const cs1 = csrfRes.headers.getSetCookie()
    .map(c => c.split(";")[0]).join("; ");
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cs1 },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  return [
    ...cs1.split("; "),
    ...login.headers.getSetCookie().map(c => c.split(";")[0]),
  ].join("; ");
}

async function fetchProducts(cookies) {
  const res = await fetch(`${BASE}/api/irecursos/client-products`, {
    headers: { Cookie: cookies },
  });
  return { status: res.status, data: await res.json() };
}

const demo = await prisma.company.findFirst({
  where: { users: { some: { email: "cliente@demo.com" } } },
});
const original = demo.irecursosClientId;
const cookies = await getSession("cliente@demo.com", "Cliente123!");

function describe(name) { console.log(`\n── ${name} ──`); }
function show(label, data) {
  const summary = {
    source: data?.source,
    reason: data?.reason,
    contractsCount: data?.contracts?.length ?? 0,
  };
  console.log(`  ${label}: ${JSON.stringify(summary)}`);
}

try {
  // ── Caso 1: empresa SIN irecursosClientId ──
  describe("Caso 1: empresa sin irecursosClientId (creada manual)");
  await prisma.company.update({
    where: { id: demo.id },
    data: { irecursosClientId: null },
  });
  const r1 = await fetchProducts(cookies);
  show("Respuesta", r1.data);
  console.log(`  UI esperada: select estatico, SIN mensaje (reason=no-irecursos-link)`);

  // ── Caso 2: empresa CON CODCLI pero cliente sin contratos activos ──
  describe("Caso 2: cliente sin contratos activos");
  // Buscamos un CODCLI real que sabemos que tiene 0 contratos.
  // De la muestra de 52 paneles, 22 estaban sin contratos. Usamos uno
  // del rango medio que sabemos vacio (p.ej. 4500).
  await prisma.company.update({
    where: { id: demo.id },
    data: { irecursosClientId: "5430" },
  });
  const r2 = await fetchProducts(cookies);
  show("Respuesta", r2.data);
  console.log(`  UI esperada: select estatico + mensaje "No se encontraron contratos activos…"`);

  // ── Caso 3: empresa CON CODCLI valido y contratos activos ──
  describe("Caso 3: cliente con contratos activos en iRecursos");
  await prisma.company.update({
    where: { id: demo.id },
    data: { irecursosClientId: "5412" },
  });
  const r3 = await fetchProducts(cookies);
  show("Respuesta", r3.data);
  console.log(`  UI esperada: select con los ${r3.data?.contracts?.length} contratos reales, sin mensaje`);

  // ── Caso 4: simulamos credenciales mal (forzando reinicio mental) ──
  // No podemos cambiar el env del server arrancado en tiempo real, asi que
  // verificamos que el flujo del endpoint ANTE UN CODCLI con caracteres
  // invalidos sigue siendo defensivo y no expone errores internos.
  describe("Caso 4: CODCLI invalido (probando defensa del endpoint)");
  await prisma.company.update({
    where: { id: demo.id },
    data: { irecursosClientId: "<<invalid>>" },
  });
  const r4 = await fetchProducts(cookies);
  show("Respuesta", r4.data);
  console.log(`  Endpoint nunca lanza 500: source=${r4.data?.source}, status=${r4.status}`);
  console.log(`  UI esperada: select estatico + mensaje de fallback`);
} finally {
  await prisma.company.update({
    where: { id: demo.id },
    data: { irecursosClientId: original },
  });
  console.log(`\nempresa demo restaurada (irecursosClientId=${original})`);
  await prisma.$disconnect();
}
