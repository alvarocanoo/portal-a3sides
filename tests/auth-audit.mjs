// Auditoria de seguridad — pruebas reales contra el servidor
const BASE = "http://localhost:3000";

async function getSession(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
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
    redirect: "manual",
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function test(name, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"} | ${name} | status=${actual} expected=${expected}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  console.log("=== AUDITORIA DE SEGURIDAD ===\n");

  // Login como los 3 roles
  console.log("Obteniendo sesiones...");
  const clientCookies = await getSession("cliente@demo.com", "Cliente123!");
  const agentCookies = await getSession("agente@a3sides.es", "Agente123!");
  const adminCookies = await getSession("admin@a3sides.es", "Admin123!");
  console.log("3 sesiones obtenidas.\n");

  // ── PUNTO 2: Cliente accediendo a endpoints de admin ──
  console.log("── PUNTO 2: Autorizacion backend (cliente -> admin) ──");

  let r = await apiCall("GET", "/api/users", clientCookies);
  test("Cliente -> GET /api/users", r.status, 403);

  r = await apiCall("POST", "/api/users", clientCookies, {
    email: "hack@test.com", firstName: "Hack", lastName: "Test", role: "ADMIN"
  });
  test("Cliente -> POST /api/users (crear admin)", r.status, 403);

  r = await apiCall("GET", "/api/companies", clientCookies);
  test("Cliente -> GET /api/companies", r.status, 403);

  r = await apiCall("POST", "/api/companies", clientCookies, { name: "Hack Corp" });
  test("Cliente -> POST /api/companies", r.status, 403);

  r = await apiCall("GET", "/api/irecursos/health", clientCookies);
  test("Cliente -> GET /api/irecursos/health", r.status, 403);

  // ── Agente accediendo a endpoints de admin ──
  console.log("\n── Agente -> endpoints admin ──");

  r = await apiCall("GET", "/api/users", agentCookies);
  test("Agente -> GET /api/users", r.status, 403);

  r = await apiCall("POST", "/api/companies", agentCookies, { name: "Hack Corp" });
  test("Agente -> POST /api/companies", r.status, 403);

  // ── PUNTO 3 y 4: Aislamiento multi-tenant ──
  console.log("\n── PUNTO 3-4: Aislamiento multi-tenant ──");

  // Obtener incidencias del admin (ve todas)
  const adminIncidents = await apiCall("GET", "/api/incidents", adminCookies);
  const allIncidents = adminIncidents.data?.items || [];
  console.log(`Total incidencias en sistema: ${allIncidents.length}`);

  // Obtener incidencias del cliente (solo las de su empresa)
  const clientIncidents = await apiCall("GET", "/api/incidents", clientCookies);
  const clientItems = clientIncidents.data?.items || [];
  console.log(`Incidencias visibles para cliente: ${clientItems.length}`);

  if (allIncidents.length > 0) {
    // Cliente intenta acceder a una incidencia por ID directo
    // Primero, con una que SI es suya
    if (clientItems.length > 0) {
      r = await apiCall("GET", `/api/incidents/${clientItems[0].id}`, clientCookies);
      test("Cliente -> su propia incidencia", r.status, 200);
    }

    // Ahora, buscar una incidencia que NO sea de la empresa del cliente
    // (si existe — en el seed todas son de la misma empresa, asi que creamos una situacion)
    // Intentamos con un ID inventado
    r = await apiCall("GET", "/api/incidents/00000000-0000-0000-0000-000000000000", clientCookies);
    test("Cliente -> incidencia con ID inexistente", r.status, 404);

    // Cliente intenta enviar mensaje a una incidencia
    if (clientItems.length > 0) {
      r = await apiCall("POST", `/api/incidents/${clientItems[0].id}/messages`, clientCookies, {
        content: "Test de seguridad", isInternal: false
      });
      test("Cliente -> mensaje en su incidencia", r.status, 201);

      // Cliente intenta crear nota interna (solo agentes)
      r = await apiCall("POST", `/api/incidents/${clientItems[0].id}/messages`, clientCookies, {
        content: "Nota interna hack", isInternal: true
      });
      test("Cliente -> nota interna (debe fallar)", r.status, 403);
    }

    // Cliente intenta asignar incidencia
    if (clientItems.length > 0) {
      r = await apiCall("PATCH", `/api/incidents/${clientItems[0].id}/assign`, clientCookies, {
        assignedToId: "00000000-0000-0000-0000-000000000000"
      });
      test("Cliente -> asignar incidencia", r.status, 403);
    }

    // Cliente intenta cambiar estado a IN_PROGRESS (solo agentes)
    if (clientItems.length > 0) {
      const openIncident = clientItems.find(i => i.status === "OPEN");
      if (openIncident) {
        r = await apiCall("PATCH", `/api/incidents/${openIncident.id}/status`, clientCookies, {
          status: "IN_PROGRESS"
        });
        test("Cliente -> cambiar a IN_PROGRESS (solo agente)", r.status, 400);
      }
    }
  }

  // ── PUNTO 5: Token JWT ──
  console.log("\n── PUNTO 5: Token JWT ──");

  // Verificar que el token no expone datos sensibles
  // Extraer el token JWT de las cookies
  const tokenCookie = clientCookies.split("; ").find(c => c.startsWith("authjs.session-token="));
  if (tokenCookie) {
    const token = tokenCookie.split("=")[1];
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        console.log("JWT payload keys:", Object.keys(payload).join(", "));
        const hasPassword = JSON.stringify(payload).includes("password") || JSON.stringify(payload).includes("Hash");
        test("JWT no contiene password/hash", hasPassword ? 1 : 0, 0);

        if (payload.exp) {
          const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
          const hours = Math.round(expiresIn / 3600);
          console.log(`JWT expira en: ${hours}h`);
          test("JWT expira en <= 24h", hours <= 24 ? 0 : 1, 0);
        }
      } catch {
        console.log("JWT esta cifrado (no se puede leer el payload) — bien.");
      }
    } else {
      console.log("Token no es JWT estandar (posiblemente cifrado) — bien.");
    }
  }

  // ── Peticion sin autenticar ──
  console.log("\n── Sin autenticar ──");
  r = await apiCall("GET", "/api/incidents", "");
  test("Sin auth -> GET /api/incidents", r.status, 401);

  r = await apiCall("GET", "/api/users", "");
  test("Sin auth -> GET /api/users", r.status, 401);

  console.log("\n=== FIN AUDITORIA ===");
}

main().catch(console.error);
