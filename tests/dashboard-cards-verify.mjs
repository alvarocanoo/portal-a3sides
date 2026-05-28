// Verifica que cada tarjeta del dashboard:
//  (a) muestra el conteo correcto del estado
//  (b) al "hacer click" (= cargar /incidencias?status=X) el listado
//      devuelve exactamente esas mismas incidencias
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

// ── Setup: garantizar incidencias en TODOS los estados para que el test
//    sea concluyente. Creamos las que falten temporalmente.
const STATUSES = ["OPEN","IN_PROGRESS","WAITING_CLIENT","WAITING_THIRD_PARTY","RESOLVED","CLOSED"];

const cliente = await prisma.user.findUnique({ where: { email: "cliente@demo.com" }, select: { id: true, companyId: true } });
const agent = await prisma.user.findUnique({ where: { email: "agente@a3sides.es" }, select: { id: true } });

const createdRefs = [];
console.log("Asegurando una incidencia en cada estado para el test...");

for (let i = 0; i < STATUSES.length; i++) {
  const status = STATUSES[i];
  const reference = `INC-DASHTEST-${status}`;
  const data = {
    reference,
    subject: `Test dashboard ${status}`,
    description: "Test temporal",
    status,
    priority: "MEDIUM",
    companyId: cliente.companyId,
    createdById: cliente.id,
    assignedToId: status === "OPEN" ? null : agent.id,
    firstResponseAt: status !== "OPEN" ? new Date() : null,
    resolvedAt: (status === "RESOLVED" || status === "CLOSED") ? new Date() : null,
    closedAt: status === "CLOSED" ? new Date() : null,
  };
  await prisma.incident.upsert({
    where: { reference },
    update: { status, assignedToId: data.assignedToId, resolvedAt: data.resolvedAt, closedAt: data.closedAt },
    create: data,
  });
  createdRefs.push(reference);
}
console.log(`OK: 1 incidencia por cada uno de los ${STATUSES.length} estados.\n`);

try {
  const cookies = await getSession("cliente@demo.com", "Cliente123!");

  // ── Para cada estado: contar en BD y comparar con lo que devuelve /api/incidents ──
  console.log("── Verificacion estado por estado ──\n");
  let totalDeBD = 0;
  for (const status of STATUSES) {
    const dbCount = await prisma.incident.count({
      where: { companyId: cliente.companyId, status },
    });
    totalDeBD += dbCount;

    const res = await fetch(`${BASE}/api/incidents?status=${status}&limit=100`, {
      headers: { Cookie: cookies },
    });
    const data = await res.json();
    const apiCount = data.total ?? data.items?.length ?? 0;

    pass(
      `${status}: BD=${dbCount} == listado filtrado=${apiCount}`,
      dbCount === apiCount
    );
  }

  // ── Total ──
  const totalRes = await fetch(`${BASE}/api/incidents?limit=1`, {
    headers: { Cookie: cookies },
  });
  const totalData = await totalRes.json();
  pass(`Total: BD=${totalDeBD} == listado sin filtro=${totalData.total}`, totalDeBD === totalData.total);

  // ── Verificar que el dashboard SSR renderiza los conteos correctos ──
  // Pedimos /dashboard como HTML y extraemos los numeros de cada tarjeta
  console.log("\n── Verificacion conteos en el HTML del dashboard ──");
  const dashRes = await fetch(`${BASE}/dashboard`, { headers: { Cookie: cookies } });
  const html = await dashRes.text();

  // Cada tarjeta es <a href="/incidencias?status=X">...<p class="text-2xl">N</p>...</a>
  const cardMatches = [...html.matchAll(/href="\/incidencias\?status=([A-Z_]+)"[\s\S]*?<p class="text-2xl[^"]*">(\d+)<\/p>/g)];
  const cardCounts = Object.fromEntries(cardMatches.map((m) => [m[1], parseInt(m[2], 10)]));

  for (const status of STATUSES) {
    const dbCount = await prisma.incident.count({ where: { companyId: cliente.companyId, status } });
    const cardCount = cardCounts[status];
    pass(
      `Tarjeta ${status} muestra ${cardCount} y BD tiene ${dbCount}`,
      cardCount === dbCount
    );
  }

  // Total card (lleva a /incidencias sin status)
  const totalCardMatch = html.match(/href="\/incidencias"[^>]*>[\s\S]*?<p class="text-2xl[^"]*">(\d+)<\/p>/);
  const totalCard = totalCardMatch ? parseInt(totalCardMatch[1], 10) : -1;
  pass(`Tarjeta Total muestra ${totalCard} y BD tiene ${totalDeBD}`, totalCard === totalDeBD);

} finally {
  // Limpieza
  await prisma.incident.deleteMany({ where: { reference: { in: createdRefs } } });
  console.log(`\nDatos temporales borrados (${createdRefs.length} incidencias).`);
  await prisma.$disconnect();
}
