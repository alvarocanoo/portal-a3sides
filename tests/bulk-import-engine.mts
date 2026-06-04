/**
 * Tests del orquestador bulk-import.service.
 *
 * Inyecta mocks de TODO (fetchPage, prisma, createUser, sendEmail, audit,
 * sleep, now). No toca iRecursos, no toca BD, no envía emails. Verifica el
 * comportamiento del motor: secuencialidad, pausas, dedupe, stats, audit.
 *
 * Ejecutar: npx tsx tests/bulk-import-engine.mts
 */

import {
  bulkImportFromIRecursos,
  MAX_PAGES_HARD_CAP,
  type BulkImportOptions,
  type BulkImportDeps,
  type BulkImportStats,
} from "../src/services/bulk-import.service.ts";
import type { ParsedClient, ParseResult } from "../src/lib/irecursos/parse-modal-clients.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(name);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    name,
    ok,
    ok
      ? undefined
      : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
  );
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n--- ${name} ---`);
  try {
    await fn();
  } catch (err) {
    console.log(
      `FAIL | ${name} (excepción) — ${err instanceof Error ? err.message : err}`
    );
    failed++;
    failures.push(name);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers para construir datos sintéticos
// ──────────────────────────────────────────────────────────────────────

function mkClient(overrides: Partial<ParsedClient> = {}): ParsedClient {
  return {
    codcli: "100",
    name: "EMPRESA TEST SL",
    organization: "EMPRESA TEST SL",
    nif: "B12345678",
    phone: "910000000",
    email: "test@ejemplo.test",
    blocked: false,
    ...overrides,
  };
}

function mkPage(
  clients: ParsedClient[],
  totalPages: number | null = 5
): ParseResult {
  return { clients, totalPages, errors: [] };
}

// ──────────────────────────────────────────────────────────────────────
// Mock factory — devuelve unos deps + un registro de llamadas mutable
// ──────────────────────────────────────────────────────────────────────

interface CallRegistry {
  fetchPage: number[];
  companyFindUnique: { where: unknown }[];
  companyFindFirst: { where: unknown }[];
  companyCreate: { data: unknown }[];
  companyUpdate: { where: unknown; data: unknown }[];
  createUser: { email: string; companyId?: string }[];
  sendEmail: { to: string; subject: string }[];
  audit: unknown[];
  sleep: number[];
  logout: number; // veces que se invocó (debe ser 1 al final)
}

interface MockDb {
  // estado simulado: codcli → Company; id → Company; email → User
  companiesByCodcli: Map<string, { id: string; taxId: string | null }>;
  companiesByNif: Map<string, { id: string; codcli: string | null }>;
  usersByEmail: Set<string>;
}

function makeDeps(opts: {
  pages: ParseResult[];
  fetchPageFn?: (n: number) => Promise<ParseResult>;
  existingUsers?: string[];
  existingCompaniesByCodcli?: { codcli: string; id: string; taxId?: string | null }[];
  existingCompaniesByNif?: { nif: string; id: string }[];
  sendEmailShouldFail?: boolean;
}): {
  deps: BulkImportDeps;
  calls: CallRegistry;
  db: MockDb;
} {
  const calls: CallRegistry = {
    fetchPage: [],
    companyFindUnique: [],
    companyFindFirst: [],
    companyCreate: [],
    companyUpdate: [],
    createUser: [],
    sendEmail: [],
    audit: [],
    sleep: [],
    logout: 0,
  };

  const db: MockDb = {
    companiesByCodcli: new Map(),
    companiesByNif: new Map(),
    usersByEmail: new Set(opts.existingUsers ?? []),
  };

  for (const c of opts.existingCompaniesByCodcli ?? []) {
    db.companiesByCodcli.set(c.codcli, {
      id: c.id,
      taxId: c.taxId ?? null,
    });
  }
  for (const c of opts.existingCompaniesByNif ?? []) {
    db.companiesByNif.set(c.nif, { id: c.id, codcli: null });
  }

  const fetchPage =
    opts.fetchPageFn ??
    (async (n: number) => {
      const idx = n - 1;
      if (idx >= opts.pages.length) {
        // Devolvemos vacío (sin clients, sin errors) para activar stop por
        // empty-page si el test no controla esto explícitamente.
        return { clients: [], totalPages: opts.pages.length, errors: [] };
      }
      return opts.pages[idx];
    });

  // Wrap default fetchPage to also register the call when caller provided fn
  const wrappedFetchPage = async (n: number): Promise<ParseResult> => {
    calls.fetchPage.push(n);
    return fetchPage(n);
  };

  let companyIdCounter = 1;
  let userIdCounter = 1;

  const prismaLike = {
    company: {
      findUnique: async (args: { where: { irecursosClientId: string } }) => {
        calls.companyFindUnique.push({ where: args.where });
        const c = db.companiesByCodcli.get(args.where.irecursosClientId);
        return c ? { id: c.id } : null;
      },
      findFirst: async (args: {
        where: { taxId: string; irecursosClientId: null };
      }) => {
        calls.companyFindFirst.push({ where: args.where });
        const c = db.companiesByNif.get(args.where.taxId);
        if (!c || c.codcli !== null) return null;
        return { id: c.id };
      },
      create: async (args: {
        data: {
          name: string;
          taxId: string | null;
          irecursosClientId: string;
          isActive: boolean;
        };
      }) => {
        calls.companyCreate.push({ data: args.data });
        const id = `comp-${companyIdCounter++}`;
        db.companiesByCodcli.set(args.data.irecursosClientId, {
          id,
          taxId: args.data.taxId,
        });
        if (args.data.taxId) {
          db.companiesByNif.set(args.data.taxId, {
            id,
            codcli: args.data.irecursosClientId,
          });
        }
        return { id };
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        calls.companyUpdate.push({ where: args.where, data: args.data });
        return { id: args.where.id };
      },
    },
  } as unknown as BulkImportDeps["prisma"];

  const createUser: NonNullable<BulkImportDeps["createUser"]> = async (
    input
  ) => {
    calls.createUser.push({
      email: input.email,
      companyId: input.companyId,
    });
    const normalized = input.email.toLowerCase().trim();
    if (db.usersByEmail.has(normalized)) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
    db.usersByEmail.add(normalized);
    return {
      user: {
        id: `user-${userIdCounter++}`,
        email: normalized,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        companyId: input.companyId ?? null,
        isActive: true,
        createdAt: new Date(),
      },
      tempPassword: "Fake-Temp-Pwd-123",
    };
  };

  const sendEmail: NonNullable<BulkImportDeps["sendEmail"]> = async (input) => {
    calls.sendEmail.push({ to: input.to, subject: input.subject });
    // Refleja el contrato actual: sendEmail() devuelve false en fallo,
    // NO lanza. Antes este mock lanzaba (contrato viejo) pero el wrapper
    // real cambió en §2.1 y el mock quedó desincronizado. El service
    // ahora chequea el boolean en vez de capturar la excepción.
    if (opts.sendEmailShouldFail) {
      return false;
    }
    return true;
  };

  const audit: NonNullable<BulkImportDeps["audit"]> = async (input) => {
    calls.audit.push(input);
    return { id: "audit-1" } as never;
  };

  const sleep = async (ms: number) => {
    calls.sleep.push(ms);
  };

  let nowCounter = 1_700_000_000_000;
  const now = () => {
    nowCounter += 1;
    return nowCounter;
  };

  const logout = async () => {
    calls.logout += 1;
  };

  return {
    deps: {
      fetchPage: wrappedFetchPage,
      prisma: prismaLike,
      createUser,
      sendEmail,
      audit,
      sleep,
      now,
      logout,
    },
    calls,
    db,
  };
}

function defaultOptions(
  overrides: Partial<BulkImportOptions> = {}
): BulkImportOptions {
  return {
    maxPages: 2,
    sendOnboardingEmails: false,
    pauseMs: 1500,
    adminUserId: "admin-uuid",
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tests de validación de opciones
// ──────────────────────────────────────────────────────────────────────

await test("maxPages = 0 → error", async () => {
  const { deps } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(defaultOptions({ maxPages: 0 }), deps);
    assert("debería haber lanzado", false);
  } catch (err) {
    assert(
      "error MAX_PAGES_INVALID",
      err instanceof Error && err.message === "MAX_PAGES_INVALID"
    );
  }
});

await test("maxPages > cap duro → error", async () => {
  const { deps } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(
      defaultOptions({ maxPages: MAX_PAGES_HARD_CAP + 1 }),
      deps
    );
    assert("debería haber lanzado", false);
  } catch (err) {
    assert(
      "error MAX_PAGES_TOO_HIGH",
      err instanceof Error && err.message.startsWith("MAX_PAGES_TOO_HIGH")
    );
  }
});

await test("pauseMs < 500 → error", async () => {
  const { deps } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(defaultOptions({ pauseMs: 100 }), deps);
    assert("debería haber lanzado", false);
  } catch (err) {
    assert(
      "error PAUSE_MS_OUT_OF_RANGE",
      err instanceof Error && err.message.startsWith("PAUSE_MS_OUT_OF_RANGE")
    );
  }
});

await test("pauseMs > 10000 → error", async () => {
  const { deps } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(defaultOptions({ pauseMs: 20_000 }), deps);
    assert("debería haber lanzado", false);
  } catch (err) {
    assert(
      "error PAUSE_MS_OUT_OF_RANGE",
      err instanceof Error && err.message.startsWith("PAUSE_MS_OUT_OF_RANGE")
    );
  }
});

await test("adminUserId vacío → error", async () => {
  const { deps } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(defaultOptions({ adminUserId: "" }), deps);
    assert("debería haber lanzado", false);
  } catch (err) {
    assert(
      "error ADMIN_USER_ID_REQUIRED",
      err instanceof Error && err.message === "ADMIN_USER_ID_REQUIRED"
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// Flujo normal
// ──────────────────────────────────────────────────────────────────────

await test("2 páginas con 10 clientes válidos → 20 users creados", async () => {
  const page1 = mkPage(
    Array.from({ length: 10 }, (_, i) =>
      mkClient({
        codcli: String(i + 100),
        email: `cli${i + 100}@ejemplo.test`,
        nif: `B${String(i + 100).padStart(8, "0")}`,
      })
    ),
    5
  );
  const page2 = mkPage(
    Array.from({ length: 10 }, (_, i) =>
      mkClient({
        codcli: String(i + 200),
        email: `cli${i + 200}@ejemplo.test`,
        nif: `B${String(i + 200).padStart(8, "0")}`,
      })
    ),
    5
  );
  const { deps, calls } = makeDeps({ pages: [page1, page2] });

  const stats = await bulkImportFromIRecursos(defaultOptions(), deps);

  eq("pagesProcessed = 2", stats.pagesProcessed, 2);
  eq("rowsParsed = 20", stats.rowsParsed, 20);
  eq("companiesCreated = 20", stats.companiesCreated, 20);
  eq("usersCreated = 20", stats.usersCreated, 20);
  eq("invitationsPrepared = 20", stats.invitationsPrepared, 20);
  eq("invitationsSent = 0", stats.invitationsSent, 0);
  eq("sendEmail nunca llamado", calls.sendEmail.length, 0);
  eq("fetchPage llamado 2 veces", calls.fetchPage, [1, 2]);
  eq("sleep llamado UNA vez (entre 1 y 2)", calls.sleep, [1500]);
  eq("audit log emitido 1 vez", calls.audit.length, 1);
});

// ──────────────────────────────────────────────────────────────────────
// Stop temprano
// ──────────────────────────────────────────────────────────────────────

await test("stop por total-pages-reached", async () => {
  // iRecursos dice totalPages=2 → no debe pedir página 3
  const page1 = mkPage([mkClient({ codcli: "1", email: "a@x.test" })], 2);
  const page2 = mkPage([mkClient({ codcli: "2", email: "b@x.test" })], 2);
  const { deps, calls } = makeDeps({ pages: [page1, page2] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 5 }),
    deps
  );

  eq("solo 2 páginas pedidas", calls.fetchPage, [1, 2]);
  eq("stoppedReason = total-pages-reached", stats.stoppedReason, "total-pages-reached");
  eq("totalPagesInIRecursos = 2", stats.totalPagesInIRecursos, 2);
});

await test("stop por empty-page", async () => {
  const page1 = mkPage([mkClient({ codcli: "1", email: "a@x.test" })], 10);
  const pageEmpty: ParseResult = { clients: [], totalPages: 10, errors: [] };
  const { deps, calls } = makeDeps({ pages: [page1, pageEmpty] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 5 }),
    deps
  );

  eq("se paró tras la vacía", calls.fetchPage, [1, 2]);
  eq("stoppedReason = empty-page", stats.stoppedReason, "empty-page");
});

await test("stop por page-fetch-error (1 página falla)", async () => {
  const page1 = mkPage([mkClient({ codcli: "1", email: "a@x.test" })], 10);
  const { deps, calls } = makeDeps({
    pages: [page1],
    fetchPageFn: async (n) => {
      if (n === 2) throw new Error("IRECURSOS_BAD_RESPONSE");
      return page1;
    },
  });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 5 }),
    deps
  );

  eq("se intentaron 2 páginas (1 OK, 2 falla)", calls.fetchPage, [1, 2]);
  eq("pagesProcessed = 1", stats.pagesProcessed, 1);
  eq("stoppedReason = page-fetch-error", stats.stoppedReason, "page-fetch-error");
  assert(
    "stopError contiene mensaje del error",
    stats.stopError?.includes("IRECURSOS_BAD_RESPONSE") ?? false
  );
});

// ──────────────────────────────────────────────────────────────────────
// Pausa entre páginas
// ──────────────────────────────────────────────────────────────────────

await test("pausa SOLO entre páginas, no antes de la 1ª ni después de la última", async () => {
  const p = mkPage([mkClient({ codcli: "x", email: "x@x.test" })], 3);
  const { deps, calls } = makeDeps({ pages: [p, p, p] });

  await bulkImportFromIRecursos(defaultOptions({ maxPages: 3 }), deps);

  // 3 páginas → 2 pausas (entre 1-2 y entre 2-3)
  eq("2 pausas para 3 páginas", calls.sleep, [1500, 1500]);
});

await test("pausa configurable", async () => {
  const p = mkPage([mkClient({ codcli: "x", email: "x@x.test" })], 2);
  const { deps, calls } = makeDeps({ pages: [p, p] });

  await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 2, pauseMs: 3000 }),
    deps
  );

  eq("pausa de 3000 ms", calls.sleep, [3000]);
});

// ──────────────────────────────────────────────────────────────────────
// Casos por cliente
// ──────────────────────────────────────────────────────────────────────

await test("codcli '0' → skip system-placeholder", async () => {
  const page = mkPage(
    [
      mkClient({ codcli: "0", name: "CLIENTES VARIOS", email: null, nif: "" }),
      mkClient({ codcli: "1", email: "uno@x.test" }),
    ],
    1
  );
  const { deps, calls } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("systemPlaceholderSkipped = 1", stats.systemPlaceholderSkipped, 1);
  eq("companiesCreated = 1 (solo el codcli 1)", stats.companiesCreated, 1);
  eq("usersCreated = 1", stats.usersCreated, 1);
  eq("createUser llamado solo 1 vez", calls.createUser.length, 1);
  eq("findUnique NO llamado para codcli 0", calls.companyFindUnique.length, 1);
});

await test("blocked=true → ni Company ni User", async () => {
  const page = mkPage(
    [
      mkClient({ codcli: "10", email: "bloq@x.test", blocked: true }),
      mkClient({ codcli: "11", email: "ok@x.test" }),
    ],
    1
  );
  const { deps, calls } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("blockedSkipped = 1", stats.blockedSkipped, 1);
  eq("companiesCreated = 1 (solo no-bloqueado)", stats.companiesCreated, 1);
  eq("usersCreated = 1", stats.usersCreated, 1);
  eq("findUnique solo para no-bloqueado", calls.companyFindUnique.length, 1);
});

await test("sin email → Company sí, sin User", async () => {
  const page = mkPage(
    [
      mkClient({ codcli: "20", email: null, nif: "B20202020" }),
    ],
    1
  );
  const { deps, calls } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("companiesCreated = 1", stats.companiesCreated, 1);
  eq("companiesNoEmail = 1", stats.companiesNoEmail, 1);
  eq("usersCreated = 0", stats.usersCreated, 0);
  eq("createUser NO llamado", calls.createUser.length, 0);
});

await test("email duplicado → skip + report, Company sí se procesa", async () => {
  const page = mkPage(
    [mkClient({ codcli: "30", email: "ya-existe@x.test" })],
    1
  );
  const { deps } = makeDeps({
    pages: [page],
    existingUsers: ["ya-existe@x.test"],
  });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("companiesCreated = 1", stats.companiesCreated, 1);
  eq("usersSkippedDuplicateEmail = 1", stats.usersSkippedDuplicateEmail, 1);
  eq("usersCreated = 0", stats.usersCreated, 0);
  assert(
    "sampleIssues contiene la duplicación",
    stats.sampleIssues.some(
      (s) =>
        s.codcli === "30" &&
        s.kind === "user-duplicate-email" &&
        s.detail === "ya-existe@x.test"
    )
  );
});

await test("Company existente por codcli → update, no create", async () => {
  const page = mkPage([mkClient({ codcli: "40", email: "x@x.test" })], 1);
  const { deps, calls } = makeDeps({
    pages: [page],
    existingCompaniesByCodcli: [{ codcli: "40", id: "comp-existing" }],
  });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("companiesCreated = 0", stats.companiesCreated, 0);
  eq("companiesUpdated = 1", stats.companiesUpdated, 1);
  eq("create NO llamado", calls.companyCreate.length, 0);
  eq("update llamado", calls.companyUpdate.length, 1);
});

await test("Company existente por NIF sin codcli → update + linked-by-nif", async () => {
  const page = mkPage(
    [mkClient({ codcli: "50", nif: "B50505050", email: "x@x.test" })],
    1
  );
  const { deps, calls } = makeDeps({
    pages: [page],
    existingCompaniesByNif: [{ nif: "B50505050", id: "comp-by-nif" }],
  });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("companiesUpdated = 1", stats.companiesUpdated, 1);
  eq("companiesLinkedByNif = 1", stats.companiesLinkedByNif, 1);
  eq("create NO llamado", calls.companyCreate.length, 0);
  // El update debe haber invalidado el cache de contratos
  const updateCall = calls.companyUpdate[0]?.data as {
    cachedContracts: unknown;
    cachedContractsAt: unknown;
    irecursosClientId: string;
  };
  eq("cachedContracts invalidado", updateCall.cachedContracts, null);
  eq("cachedContractsAt invalidado", updateCall.cachedContractsAt, null);
  eq("irecursosClientId asignado", updateCall.irecursosClientId, "50");
});

// ──────────────────────────────────────────────────────────────────────
// Onboarding email
// ──────────────────────────────────────────────────────────────────────

await test("sendOnboardingEmails=false → sendEmail NUNCA llamado", async () => {
  const page = mkPage([mkClient({ codcli: "60", email: "x@x.test" })], 1);
  const { deps, calls } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1, sendOnboardingEmails: false }),
    deps
  );

  eq("invitationsPrepared = 1", stats.invitationsPrepared, 1);
  eq("invitationsSent = 0", stats.invitationsSent, 0);
  eq("sendEmail llamado 0 veces", calls.sendEmail.length, 0);
});

await test("sendOnboardingEmails=true → sendEmail llamado con subject correcto", async () => {
  const page = mkPage([mkClient({ codcli: "70", email: "x@x.test" })], 1);
  const { deps, calls } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1, sendOnboardingEmails: true }),
    deps
  );

  eq("invitationsSent = 1", stats.invitationsSent, 1);
  eq("invitationsPrepared = 0", stats.invitationsPrepared, 0);
  eq("sendEmail llamado 1 vez", calls.sendEmail.length, 1);
  eq("sendEmail al email correcto", calls.sendEmail[0].to, "x@x.test");
  assert(
    "subject del email contiene 'Portal de Soporte'",
    calls.sendEmail[0].subject.includes("Portal de Soporte")
  );
});

await test("sendEmail falla → user creado igualmente + noteIssue", async () => {
  const page = mkPage([mkClient({ codcli: "80", email: "x@x.test" })], 1);
  const { deps } = makeDeps({ pages: [page], sendEmailShouldFail: true });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1, sendOnboardingEmails: true }),
    deps
  );

  eq("usersCreated = 1 (user creado a pesar del fallo)", stats.usersCreated, 1);
  eq("invitationsSent = 0", stats.invitationsSent, 0);
  assert(
    "sampleIssues incluye email-send-failed",
    stats.sampleIssues.some((s) => s.kind === "email-send-failed")
  );
});

// ──────────────────────────────────────────────────────────────────────
// Audit log
// ──────────────────────────────────────────────────────────────────────

await test("audit log con action correcta y stats", async () => {
  const page = mkPage([mkClient({ codcli: "90", email: "x@x.test" })], 1);
  const { deps, calls } = makeDeps({ pages: [page] });

  await bulkImportFromIRecursos(defaultOptions({ maxPages: 1 }), deps);

  eq("audit llamado 1 vez", calls.audit.length, 1);
  const call = calls.audit[0] as {
    action: string;
    userId: string;
    metadata: {
      stats: BulkImportStats;
      options: BulkImportOptions;
    };
  };
  eq("action correcta", call.action, "bulk_import.irecursos");
  eq("userId del admin", call.userId, "admin-uuid");
  eq("metadata.stats.usersCreated = 1", call.metadata.stats.usersCreated, 1);
  eq(
    "metadata.options.sendOnboardingEmails = false",
    call.metadata.options.sendOnboardingEmails,
    false
  );
});

// ──────────────────────────────────────────────────────────────────────
// Errores de parsing en la página (no rompen la importación)
// ──────────────────────────────────────────────────────────────────────

await test("errores de parsing en página → reportados pero no abortan", async () => {
  const page: ParseResult = {
    clients: [mkClient({ codcli: "95", email: "ok@x.test" })],
    totalPages: 1,
    errors: [{ rowIndex: 3, reason: "Se esperaban 7 celdas, se encontraron 5", snippet: "<tr>..." }],
  };
  const { deps } = makeDeps({ pages: [page] });

  const stats = await bulkImportFromIRecursos(
    defaultOptions({ maxPages: 1 }),
    deps
  );

  eq("parseErrors = 1", stats.parseErrors, 1);
  eq("rowsParsed = 1 (cliente válido)", stats.rowsParsed, 1);
  eq("usersCreated = 1", stats.usersCreated, 1);
  assert(
    "sampleIssues incluye parse-error",
    stats.sampleIssues.some((s) => s.kind === "parse-error")
  );
});

// ──────────────────────────────────────────────────────────────────────
// Logout SIEMPRE se llama al final (try/finally)
//
// El servicio envuelve toda la importación en try/finally, de forma que
// `logoutIRecursos()` se invoca al terminar pase lo que pase. Esto cierra
// la sesión en iRecursos (limitado por número de sesiones concurrentes
// que no expiran solas).
// ──────────────────────────────────────────────────────────────────────

await test("logout se llama UNA vez tras importación exitosa", async () => {
  const page = mkPage([mkClient({ codcli: "1", email: "x@x.test" })], 1);
  const { deps, calls } = makeDeps({ pages: [page] });

  await bulkImportFromIRecursos(defaultOptions({ maxPages: 1 }), deps);

  eq("logout invocado exactamente 1 vez", calls.logout, 1);
});

await test("logout se llama tras fallo de página (camino catch)", async () => {
  const { deps, calls } = makeDeps({
    pages: [],
    fetchPageFn: async () => {
      throw new Error("IRECURSOS_BAD_RESPONSE");
    },
  });

  const stats = await bulkImportFromIRecursos(defaultOptions({ maxPages: 1 }), deps);

  eq("logout invocado 1 vez tras page-fetch-error", calls.logout, 1);
  eq("stoppedReason refleja el fallo", stats.stoppedReason, "page-fetch-error");
});

await test("validación falla ANTES del try → logout NO se llama", async () => {
  const { deps, calls } = makeDeps({ pages: [] });
  try {
    await bulkImportFromIRecursos(defaultOptions({ maxPages: 0 }), deps);
  } catch {
    // esperado: MAX_PAGES_INVALID
  }
  // El throw es ANTES del try { ... } finally { logout() }, así que
  // logout NO debe ejecutarse: no hay sesión iRecursos abierta tampoco
  // (nunca se llegó a llamar a fetchPage).
  eq("logout NO se llama si la validación rechaza", calls.logout, 0);
});

// ──────────────────────────────────────────────────────────────────────
// Resumen
// ──────────────────────────────────────────────────────────────────────

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
if (failures.length) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
