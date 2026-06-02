// Verifica que cuando un agente "toma" una incidencia (cambio a IN_PROGRESS),
// se le asigna automaticamente. Cubre escenarios: agente, admin, otros cambios
// de estado (que NO deben tocar asignacion).
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
  const cs = csrfRes.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cs },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  return [
    ...cs.split("; "),
    ...login.headers.getSetCookie().map(c => c.split(";")[0]),
  ].join("; ");
}

function pass(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
  if (!cond) process.exitCode = 1;
}

const cliente = await prisma.user.findUnique({
  where: { email: "cliente@demo.com" },
  select: { id: true, companyId: true },
});
const agent = await prisma.user.findUnique({
  where: { email: "agente@a3sides.es" },
  select: { id: true, firstName: true, lastName: true },
});
const admin = await prisma.user.findUnique({
  where: { email: "admin@a3sides.es" },
  select: { id: true, firstName: true, lastName: true },
});

const createdRefs = [];
const createdIncidentIds = [];

async function createIncident(suffix) {
  const reference = `INC-ASSIGN-${suffix}-${Date.now()}`;
  const inc = await prisma.incident.create({
    data: {
      reference,
      subject: `Test asignacion ${suffix}`,
      description: "Test",
      status: "OPEN",
      priority: "MEDIUM",
      companyId: cliente.companyId,
      createdById: cliente.id,
    },
  });
  createdRefs.push(reference);
  createdIncidentIds.push(inc.id);
  return inc;
}

const agentCookies = await getSession("agente@a3sides.es", "Agente123!");
const adminCookies = await getSession("admin@a3sides.es", "Admin123!");

try {
  console.log("=== VERIFICACION DE AUTO-ASIGNACION AL TOMAR ===\n");

  // ── Caso 1: AGENT toma una incidencia OPEN sin asignar ──
  console.log("── Caso 1: AGENT toma incidencia OPEN sin asignar ──");
  let inc = await createIncident("AGENT-NEW");
  pass("Antes: assignedToId = null", inc.assignedToId === null);

  const r1 = await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: agentCookies },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  pass("PATCH status devuelve 200", r1.status === 200);

  inc = await prisma.incident.findUnique({ where: { id: inc.id } });
  pass(
    `Despues: assignedToId = id del agente`,
    inc.assignedToId === agent.id,
    `obtenido=${inc.assignedToId?.slice(0, 8)}`
  );
  pass(`Estado = IN_PROGRESS`, inc.status === "IN_PROGRESS");

  // ── Caso 2: ADMIN toma una incidencia OPEN sin asignar ──
  console.log("\n── Caso 2: ADMIN toma incidencia OPEN sin asignar ──");
  inc = await createIncident("ADMIN-NEW");
  const r2 = await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  pass("PATCH status devuelve 200", r2.status === 200);
  inc = await prisma.incident.findUnique({ where: { id: inc.id } });
  pass(`assignedToId = id del admin`, inc.assignedToId === admin.id);

  // ── Caso 3: Cambios de estado posteriores NO deben re-asignar ──
  console.log("\n── Caso 3: cambios posteriores preservan asignacion ──");
  inc = await createIncident("PRESERVE");
  // Agente la toma
  await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: agentCookies },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  // Agente la pone en WAITING_CLIENT
  await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: agentCookies },
    body: JSON.stringify({ status: "WAITING_CLIENT" }),
  });
  inc = await prisma.incident.findUnique({ where: { id: inc.id } });
  pass("Sigue asignada al agente tras WAITING_CLIENT", inc.assignedToId === agent.id);

  // Admin la pone en RESOLVED — debe preservar al agente original
  await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({ status: "RESOLVED" }),
  });
  inc = await prisma.incident.findUnique({ where: { id: inc.id } });
  pass(
    "Tras RESOLVED por admin, sigue asignada al agente original",
    inc.assignedToId === agent.id,
    "(admin no reasigna en cambios de estado posteriores)"
  );

  // ── Caso 4: Listado muestra el agente asignado ──
  console.log("\n── Caso 4: la vista refleja la asignacion ──");
  inc = await createIncident("LISTADO");
  await fetch(`${BASE}/api/incidents/${inc.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: agentCookies },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });

  // GET listado como admin
  const listRes = await fetch(`${BASE}/api/incidents?status=IN_PROGRESS&limit=100`, {
    headers: { Cookie: adminCookies },
  });
  const list = await listRes.json();
  const found = list.items.find((i) => i.id === inc.id);
  pass(
    "Listado: incidencia aparece con assignedTo poblado",
    found && found.assignedTo && found.assignedTo.firstName === agent.firstName
  );

  // GET detalle como admin
  const detRes = await fetch(`${BASE}/api/incidents/${inc.id}`, {
    headers: { Cookie: adminCookies },
  });
  const det = await detRes.json();
  pass(
    "Detalle: assignedTo poblado correctamente",
    det.assignedTo && det.assignedTo.firstName === agent.firstName
  );

  // ── Caso 5: Verificacion final BD: cero incidencias inconsistentes ──
  console.log("\n── Caso 5: BD sin inconsistencias ──");
  const inconsistent = await prisma.incident.count({
    where: {
      status: { in: ["IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY"] },
      assignedToId: null,
      reference: { not: { startsWith: "INC-ASSIGN-" } }, // excluir las que creemos en el test
    },
  });
  pass(`Sin incidencias activas sin asignar`, inconsistent === 0, `(encontradas: ${inconsistent})`);
} finally {
  // Limpieza
  // 1. AuditLog (no cascada): el test llama a PATCH /status, que escribe
  //    en AuditLog. Sin esto, las entradas quedarian huerfanas tras
  //    borrar la incidencia. Esto era el bug real arreglado el 2026-05-29.
  if (createdIncidentIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Incident", entityId: { in: createdIncidentIds } },
    });
  }
  // 2. StatusChange e Incident (el cascade del Incident ya borraria
  //    StatusChange, el delete explicito es defensivo).
  for (const ref of createdRefs) {
    await prisma.statusChange.deleteMany({
      where: { incident: { reference: ref } },
    });
    await prisma.incident.deleteMany({ where: { reference: ref } });
  }
  console.log(`\nDatos de test borrados (${createdRefs.length} incidencias).`);
  await prisma.$disconnect();
}
