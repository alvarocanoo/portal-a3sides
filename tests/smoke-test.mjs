// Smoke test: cargar todas las rutas criticas con servidor limpio
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

async function check(path, cookies) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookies },
    redirect: "manual",
  });
  const text = await res.text();
  // Detectar trazas de error de Next.js en el HTML
  const hasError = text.includes("Cannot read properties") ||
                   text.includes("Attempted import error") ||
                   text.includes("ReferenceError") ||
                   text.includes("__next_error__");
  return { status: res.status, hasError };
}

const cookies = await getSession("admin@a3sides.es", "Admin123!");

const routes = [
  "/dashboard",
  "/incidencias",
  "/incidencias?status=OPEN",
  "/incidencias?priority=HIGH",
  "/admin/empresas",
  "/admin/usuarios",
  "/admin/audit",
];

console.log("=== SMOKE TEST (servidor limpio) ===\n");
let allOk = true;
for (const route of routes) {
  const r = await check(route, cookies);
  const tag = r.status === 200 && !r.hasError ? "OK  " : "FAIL";
  if (tag !== "OK  ") allOk = false;
  console.log(`${tag} | ${route} | status=${r.status} hasError=${r.hasError}`);
}
console.log(`\n${allOk ? "TODO OK" : "HAY FALLOS"}`);
process.exit(allOk ? 0 : 1);
