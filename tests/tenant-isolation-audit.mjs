// Test de aislamiento multi-tenant con datos reales
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();

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
  const allCookies = [
    ...cookies.split("; "),
    ...loginRes.headers.getSetCookie().map(c => c.split(";")[0]),
  ];
  return allCookies.join("; ");
}

async function apiCall(method, path, cookies, body = null) {
  const opts = {
    method,
    headers: { Cookie: cookies, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function test(name, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"} | ${name} | got=${actual} expected=${expected}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  console.log("=== TEST AISLAMIENTO MULTI-TENANT ===\n");

  // Crear segunda empresa + cliente + incidencia
  console.log("Creando empresa B con cliente e incidencia...");
  const pw = await hash("TestB123!", 12);

  const companyB = await prisma.company.upsert({
    where: { irecursosClientId: "TEST-ISOLATION" },
    update: {},
    create: { name: "Empresa B (test aislamiento)", taxId: "X0000000T", irecursosClientId: "TEST-ISOLATION" },
  });

  const clientB = await prisma.user.upsert({
    where: { email: "clienteb@test.com" },
    update: {},
    create: {
      email: "clienteb@test.com", passwordHash: pw,
      firstName: "Test", lastName: "EmpresaB",
      role: "CLIENT", companyId: companyB.id,
      mustChangePassword: false,
    },
  });

  const incidentB = await prisma.incident.upsert({
    where: { reference: "INC-TEST-ISOLATION" },
    update: {},
    create: {
      reference: "INC-TEST-ISOLATION",
      subject: "Incidencia secreta de Empresa B",
      description: "Datos confidenciales de Empresa B",
      status: "OPEN", priority: "HIGH",
      companyId: companyB.id, createdById: clientB.id,
    },
  });
  console.log(`Empresa B: ${companyB.id}`);
  console.log(`Incidencia B: ${incidentB.id}\n`);

  // Login como cliente A y cliente B
  const cookiesA = await getSession("cliente@demo.com", "Cliente123!");
  const cookiesB = await getSession("clienteb@test.com", "TestB123!");

  // ── Test 1: Cliente A lista incidencias — NO debe ver las de B ──
  const listA = await apiCall("GET", "/api/incidents", cookiesA);
  const idsA = (listA.data?.items || []).map(i => i.id);
  const seesB = idsA.includes(incidentB.id);
  test("Cliente A lista incidencias: NO ve incidencia de B", seesB ? 1 : 0, 0);

  // ── Test 2: Cliente A intenta acceder por ID directo a incidencia de B ──
  const directAccess = await apiCall("GET", `/api/incidents/${incidentB.id}`, cookiesA);
  test("Cliente A -> incidencia de B por ID directo", directAccess.status, 404);

  // ── Test 3: Cliente A intenta enviar mensaje a incidencia de B ──
  const msgAttempt = await apiCall("POST", `/api/incidents/${incidentB.id}/messages`, cookiesA, {
    content: "Intento de acceso cruzado", isInternal: false,
  });
  test("Cliente A -> mensaje en incidencia de B", msgAttempt.status, 403);

  // ── Test 4: Cliente A intenta cambiar estado de incidencia de B ──
  const statusAttempt = await apiCall("PATCH", `/api/incidents/${incidentB.id}/status`, cookiesA, {
    status: "CLOSED",
  });
  test("Cliente A -> cambiar estado de incidencia de B", statusAttempt.status, 403);

  // ── Test 5: Cliente B SI puede ver su propia incidencia ──
  const ownAccess = await apiCall("GET", `/api/incidents/${incidentB.id}`, cookiesB);
  test("Cliente B -> su propia incidencia", ownAccess.status, 200);

  // ── Test 6: Verificar middleware API sin auth ──
  const noAuth = await apiCall("GET", "/api/incidents", "");
  test("Sin auth -> API devuelve 401 JSON (no redirect)", noAuth.status, 401);

  // Limpieza
  await prisma.incident.delete({ where: { id: incidentB.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: clientB.id } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyB.id } }).catch(() => {});
  console.log("\nDatos de test limpiados.");

  await prisma.$disconnect();
  console.log("\n=== FIN TEST AISLAMIENTO ===");
}

main().catch(e => { console.error(e); process.exit(1); });
