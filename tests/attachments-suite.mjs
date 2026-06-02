// Suite de verificacion de adjuntos: flujo feliz, errores y seguridad.
// NO escribe ni datos personales ni credenciales en stdout.
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
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
  if (!cond) process.exitCode = 1;
}

// PNG valido minimo (8 bytes magic + IHDR)
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// Texto plano valido
const TXT_BYTES = new TextEncoder().encode("hola mundo");

// Bytes random (no son ningun formato valido)
function randomBytes(size) {
  const arr = new Uint8Array(size);
  for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

async function uploadAttachment(cookies, file, fields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  }
  const res = await fetch(`${BASE}/api/attachments/upload`, {
    method: "POST",
    headers: { Cookie: cookies },
    body: fd,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

console.log("=== SUITE ADJUNTOS ===\n");

const clientCookies = await getSession("cliente@demo.com", "Cliente123!");
const agentCookies = await getSession("agente@a3sides.es", "Agente123!");

// Obtener una incidencia de la empresa del cliente
const clientUser = await prisma.user.findUnique({
  where: { email: "cliente@demo.com" },
  select: { companyId: true },
});
const ownIncident = await prisma.incident.findFirst({
  where: { companyId: clientUser.companyId },
});
console.log(`Incidencia propia del cliente: ${ownIncident.reference}\n`);

// Crear empresa B + incidencia B para test cross-tenant
const companyB = await prisma.company.upsert({
  where: { irecursosClientId: "TEST-ATTACH-B" },
  update: {},
  create: { name: "Empresa B adjuntos", irecursosClientId: "TEST-ATTACH-B" },
});
const userB = await prisma.user.upsert({
  where: { email: "attach-b@test.com" },
  update: {},
  create: {
    email: "attach-b@test.com",
    passwordHash: "x",
    firstName: "B", lastName: "Test",
    role: "CLIENT", companyId: companyB.id,
    mustChangePassword: false,
  },
});
const foreignIncident = await prisma.incident.upsert({
  where: { reference: "INC-ATTACH-B-001" },
  update: {},
  create: {
    reference: "INC-ATTACH-B-001",
    subject: "Foreign", description: "x",
    status: "OPEN", priority: "MEDIUM",
    companyId: companyB.id, createdById: userB.id,
  },
});

try {
  // ── FLUJO FELIZ ─────────────────────────────────────────────
  console.log("── Flujo feliz ──");
  const png = new File([PNG_BYTES], "test.png", { type: "image/png" });
  const r1 = await uploadAttachment(clientCookies, png, { incidentId: ownIncident.id });
  pass("CLIENT sube PNG a su incidencia: 201", r1.status === 201);
  pass("Devuelve id + fileName + fileSize + mimeType",
    r1.data?.id && r1.data?.fileName === "test.png" && r1.data?.fileSize > 0 && r1.data?.mimeType === "image/png");

  const txt = new File([TXT_BYTES], "notas.txt", { type: "text/plain" });
  const r2 = await uploadAttachment(clientCookies, txt, { incidentId: ownIncident.id });
  pass("CLIENT sube texto plano: 201", r2.status === 201);

  // Descarga: verificamos que el binario que vuelve es identico
  const dl = await fetch(`${BASE}/api/attachments/${r1.data.id}`, {
    headers: { Cookie: clientCookies },
  });
  const dlBytes = new Uint8Array(await dl.arrayBuffer());
  pass("Descarga: status 200", dl.status === 200);
  pass("Descarga: content-type correcto", dl.headers.get("content-type") === "image/png");
  pass("Descarga: bytes identicos al original",
    dlBytes.length === PNG_BYTES.length &&
    [...dlBytes].every((b, i) => b === PNG_BYTES[i])
  );

  // ── CASOS DE ERROR ──────────────────────────────────────────
  console.log("\n── Casos de error ──");

  // Tipo no permitido
  const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "virus.exe", {
    type: "application/x-msdownload",
  });
  const e1 = await uploadAttachment(clientCookies, exe, { incidentId: ownIncident.id });
  pass("Tipo no permitido (.exe): 400", e1.status === 400);
  pass("Codigo MIME_NOT_ALLOWED", e1.data?.code === "MIME_NOT_ALLOWED");

  // Archivo demasiado grande (11 MB de bytes random) — Next.js corta el
  // body antes que mi codigo, asi que el endpoint devuelve 413 con TOO_LARGE
  const big = new File([randomBytes(11 * 1024 * 1024)], "grande.png", {
    type: "image/png",
  });
  const e2 = await uploadAttachment(clientCookies, big, { incidentId: ownIncident.id });
  pass("Archivo > 10 MB: 413 Payload Too Large", e2.status === 413);
  pass("Codigo TOO_LARGE", e2.data?.code === "TOO_LARGE");

  // Contenido vs MIME: bytes random que dicen ser PNG
  const fake = new File([randomBytes(500)], "fake.png", { type: "image/png" });
  const e3 = await uploadAttachment(clientCookies, fake, { incidentId: ownIncident.id });
  pass("Extension miente sobre el contenido: 400", e3.status === 400);
  pass("Codigo MIME_MISMATCH", e3.data?.code === "MIME_MISMATCH");

  // Archivo vacio
  const empty = new File([new Uint8Array([])], "vacio.png", { type: "image/png" });
  const e4 = await uploadAttachment(clientCookies, empty, { incidentId: ownIncident.id });
  pass("Archivo vacio: 400", e4.status === 400);
  pass("Codigo EMPTY_FILE", e4.data?.code === "EMPTY_FILE");

  // Sin archivo
  const fd = new FormData();
  fd.append("incidentId", ownIncident.id);
  const e5res = await fetch(`${BASE}/api/attachments/upload`, {
    method: "POST", headers: { Cookie: clientCookies }, body: fd,
  });
  pass("Sin archivo en formData: 400", e5res.status === 400);

  // Sin incidentId ni messageId
  const fd2 = new FormData();
  fd2.append("file", new File([PNG_BYTES], "x.png", { type: "image/png" }));
  const e6res = await fetch(`${BASE}/api/attachments/upload`, {
    method: "POST", headers: { Cookie: clientCookies }, body: fd2,
  });
  pass("Sin incidentId ni messageId: 400", e6res.status === 400);

  // ── SEGURIDAD: ACCESO CRUZADO ───────────────────────────────
  console.log("\n── Seguridad: aislamiento ──");

  const png2 = new File([PNG_BYTES], "intruso.png", { type: "image/png" });
  const s1 = await uploadAttachment(clientCookies, png2, { incidentId: foreignIncident.id });
  pass("CLIENT A subiendo a incidencia de empresa B: 403", s1.status === 403);

  // Path traversal en el nombre (debe sanitizarse, no romper)
  const ptName = new File([PNG_BYTES], "../../etc/passwd.png", { type: "image/png" });
  const s2 = await uploadAttachment(clientCookies, ptName, { incidentId: ownIncident.id });
  pass("Nombre con path traversal: aceptado pero sanitizado (201)", s2.status === 201);
  pass("FileName sin '../' ni '/' ni '\\'",
    typeof s2.data?.fileName === "string" &&
    !s2.data.fileName.includes("..") &&
    !s2.data.fileName.includes("/") &&
    !s2.data.fileName.includes("\\")
  );

  // Sin autenticar
  const fd3 = new FormData();
  fd3.append("file", new File([PNG_BYTES], "anon.png", { type: "image/png" }));
  fd3.append("incidentId", ownIncident.id);
  const s3res = await fetch(`${BASE}/api/attachments/upload`, {
    method: "POST", body: fd3,
  });
  pass("Sin autenticar: 401", s3res.status === 401);

  // ── AGENT puede a cualquier incidencia ──────────────────────
  console.log("\n── AGENT ──");
  const a1 = await uploadAttachment(agentCookies,
    new File([PNG_BYTES], "agente.png", { type: "image/png" }),
    { incidentId: foreignIncident.id }
  );
  pass("AGENT sube a cualquier incidencia: 201", a1.status === 201);

  console.log("\n=== FIN SUITE ===");
} finally {
  // Limpieza
  // AuditLog no cascada: si alguna API loggea sobre las entidades creadas
  // (incidencia, usuario, empresa), las entradas quedarian huerfanas tras
  // borrar la entidad. Preventivo: aunque hoy este test no las genere.
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: "Incident", entityId: foreignIncident.id },
        { entityType: "User", entityId: userB.id },
        { entityType: "Company", entityId: companyB.id },
        { userId: userB.id },
      ],
    },
  }).catch(() => {});
  await prisma.attachment.deleteMany({
    where: { incident: { reference: { in: [ownIncident.reference, "INC-ATTACH-B-001"] } } }
  });
  await prisma.incident.delete({ where: { id: foreignIncident.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyB.id } }).catch(() => {});
  await prisma.$disconnect();
}
