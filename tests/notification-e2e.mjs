// Test end-to-end de notificaciones: dispara los 3 eventos del portal y
// verifica que NO rompen el flujo principal. Las llegadas se confirman
// en la bandeja de Mailtrap del usuario.
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

function pass(name, cond, ms) {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${ms !== undefined ? ` (${ms}ms)` : ""}`);
  if (!cond) process.exitCode = 1;
}

const t0 = Date.now();
const clientCookies = await getSession("cliente@demo.com", "Cliente123!");
const agentCookies = await getSession("agente@a3sides.es", "Agente123!");

console.log("=== TEST E2E NOTIFICACIONES ===\n");
console.log("Los 3 eventos disparan emails reales a Mailtrap.");
console.log("Verifica al final en https://mailtrap.io tu bandeja.\n");

let createdIncidentId;

// ── EVENTO 1: Crear incidencia ──
console.log("── EVENTO 1: Crear incidencia (cliente) ──");
const tCreate = Date.now();
const r1 = await fetch(`${BASE}/api/incidents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: clientCookies },
  body: JSON.stringify({
    subject: `Prueba notificaciones ${new Date().toLocaleTimeString("es-ES")}`,
    description: "Esta incidencia se ha creado para verificar que los emails de notificacion llegan a Mailtrap. Si lees esto en el email, funciona.",
    priority: "MEDIUM",
    category: "a3FacturaGo",
  }),
});
const created = await r1.json();
const elapsedCreate = Date.now() - tCreate;
createdIncidentId = created.id;

pass(`POST /api/incidents devuelve 201`, r1.status === 201);
pass(`Respuesta inmediata (< 3s; no espera al envio de emails)`, elapsedCreate < 3000, elapsedCreate);
console.log(`  Esperado en Mailtrap: 1 email al cliente + 1 a cada agente/admin activo (admin + agente = 2)`);

// ── EVENTO 2: Cambiar estado (agente) ──
console.log("\n── EVENTO 2: Cambio de estado (agente toma la incidencia) ──");
const tStatus = Date.now();
const r2 = await fetch(`${BASE}/api/incidents/${createdIncidentId}/status`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Cookie: agentCookies },
  body: JSON.stringify({ status: "IN_PROGRESS" }),
});
const elapsedStatus = Date.now() - tStatus;
pass(`PATCH status devuelve 200`, r2.status === 200);
pass(`Respuesta inmediata (< 3s)`, elapsedStatus < 3000, elapsedStatus);
console.log(`  Esperado en Mailtrap: 1 email al cliente creador con "Estado cambiado a: En curso"`);

// ── EVENTO 3: Nuevo mensaje (agente responde) ──
console.log("\n── EVENTO 3: Nuevo mensaje (agente responde) ──");
const tMsg = Date.now();
const r3 = await fetch(`${BASE}/api/incidents/${createdIncidentId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: agentCookies },
  body: JSON.stringify({
    content: "Buenos dias, hemos recibido su incidencia. Esto es un mensaje de prueba.",
    isInternal: false,
  }),
});
const elapsedMsg = Date.now() - tMsg;
pass(`POST messages devuelve 201`, r3.status === 201);
pass(`Respuesta inmediata (< 3s)`, elapsedMsg < 3000, elapsedMsg);
console.log(`  Esperado en Mailtrap: 1 email al cliente con "Nuevo mensaje de Agente Soporte"`);

// ── ROBUSTEZ: nota interna NO debe notificar ──
console.log("\n── EVENTO 4: Nota interna (NO debe notificar al cliente) ──");
const r4 = await fetch(`${BASE}/api/incidents/${createdIncidentId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: agentCookies },
  body: JSON.stringify({
    content: "Esta es una nota interna. NO debe generar email al cliente.",
    isInternal: true,
  }),
});
pass(`POST nota interna devuelve 201`, r4.status === 201);
console.log(`  Esperado en Mailtrap: NINGUN email nuevo (las notas internas no notifican)`);

// Limpieza: borrar la incidencia de prueba
console.log("\n── Limpieza ──");
await prisma.message.deleteMany({ where: { incidentId: createdIncidentId } });
await prisma.statusChange.deleteMany({ where: { incidentId: createdIncidentId } });
await prisma.incident.delete({ where: { id: createdIncidentId } });
await prisma.$disconnect();
console.log(`Incidencia de prueba ${createdIncidentId} borrada.`);

console.log(`\n=== TOTAL: ${Date.now() - t0}ms ===`);
console.log(`\n>>> VERIFICA AHORA EN MAILTRAP <<<`);
console.log(`Bandeja esperada (orden cronologico):`);
console.log(`  1. [Sonda SMTP] Verificacion de configuracion (de la sonda inicial)`);
console.log(`  2. [INC-...] Incidencia recibida (al cliente)`);
console.log(`  3. [INC-...] Nueva incidencia (al admin)`);
console.log(`  4. [INC-...] Nueva incidencia (al agente)`);
console.log(`  5. [INC-...] Estado actualizado: En curso (al cliente)`);
console.log(`  6. [INC-...] Estado actualizado: En curso (al agente)`);
console.log(`  7. [INC-...] Nuevo mensaje de Agente Soporte (al cliente)`);
console.log(`Total esperado: 7 emails (incluida la sonda).`);
