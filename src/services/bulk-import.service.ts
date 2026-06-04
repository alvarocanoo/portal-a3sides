/**
 * Motor de importación masiva de clientes desde iRecursos.
 *
 * REGLA OPERATIVA INNEGOCIABLE (CLAUDE.md §3 + reglas del usuario):
 * iRecursos limita las sesiones concurrentes. Saturarlas bloquea el acceso
 * real al portal y puede requerir intervención manual del proveedor para
 * desbloquearlo. Por tanto:
 *   - SECUENCIAL, nunca en paralelo.
 *   - Pausa configurable entre páginas (default 1500 ms).
 *   - Cap duro de páginas en código (MAX_PAGES_HARD_CAP). Para subir hay
 *     que tocar este archivo a propósito — no se puede meter un número
 *     grande accidentalmente desde el endpoint.
 *   - Si una página falla, abortar TODA la importación con stats parciales.
 *     NO se reintenta automáticamente.
 *   - Reusa la sesión cacheada del cliente iRecursos (TTL 25 min). Una
 *     sesión por importación, nunca una por página.
 *
 * Diseñado para inyección de dependencias: los tests pasan mocks de
 * fetchPage, prisma, sendEmail y sleep, y verifican el comportamiento
 * SIN tocar iRecursos ni una BD real.
 */

import { prisma as realPrisma } from "@/lib/db";
import {
  fetchClientsPage,
  logoutIRecursos,
} from "@/lib/irecursos/client";
import { sendEmail as realSendEmail } from "@/lib/email";
import { userInvitation } from "@/lib/email/templates";
import { UserService } from "@/services/user.service";
import { AuditService } from "@/services/audit.service";
import type { ParseResult } from "@/lib/irecursos/parse-modal-clients";

export const MAX_PAGES_HARD_CAP = 50;
export const SYSTEM_PLACEHOLDER_CODCLIS = new Set(["0"]);

export interface BulkImportOptions {
  maxPages: number;
  sendOnboardingEmails: boolean;
  pauseMs: number;
  adminUserId: string;
}

export interface BulkImportStats {
  pagesRequested: number;
  pagesProcessed: number;
  totalPagesInIRecursos: number | null;
  rowsParsed: number;
  parseErrors: number;

  // Per-cliente outcomes (suman a rowsParsed cuando todo va bien)
  companiesCreated: number;
  companiesUpdated: number;
  companiesLinkedByNif: number;
  usersCreated: number;
  usersSkippedDuplicateEmail: number;
  companiesNoEmail: number;
  companiesBadEmail: number;
  blockedSkipped: number;
  systemPlaceholderSkipped: number;

  // Email (preparado vs enviado)
  invitationsSent: number;
  invitationsPrepared: number;

  // Diagnóstico (truncado para no inflar audit log)
  sampleIssues: Array<{ codcli: string; kind: string; detail: string }>;

  durationMs: number;
  stoppedReason:
    | "max-pages-reached"
    | "total-pages-reached"
    | "empty-page"
    | "page-fetch-error";
  stopError?: string;
}

export interface BulkImportDeps {
  fetchPage?: (pageNumber: number) => Promise<ParseResult>;
  prisma?: typeof realPrisma;
  createUser?: typeof UserService.create;
  sendEmail?: typeof realSendEmail;
  audit?: typeof AuditService.log;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  // Inyectable para tests (mock no-op). En producción es el real
  // `logoutIRecursos` que cierra la sesión en iRecursos.
  logout?: () => Promise<void>;
}

const SAMPLE_ISSUES_MAX = 20;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Para CLIENT users importados desde iRecursos no sabemos el nombre real
 * de la persona detrás del email — solo el nombre comercial de la empresa.
 * Usamos "Cliente" como firstName placeholder y el nombre comercial como
 * lastName. El usuario lo cambia en su primer login.
 *
 * Decisión deliberada: NO partir el nombre comercial por espacios fingiendo
 * que es un nombre de persona ("MOLL ASESORES, S.L." no es "Sr. Asesores
 * S.L."). Honesto > falsos parses.
 */
function deriveUserName(commercialName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = commercialName.trim();
  if (!trimmed) return { firstName: "Cliente", lastName: "Sin nombre" };
  return { firstName: "Cliente", lastName: trimmed };
}

export async function bulkImportFromIRecursos(
  options: BulkImportOptions,
  deps: BulkImportDeps = {}
): Promise<BulkImportStats> {
  const {
    fetchPage = fetchClientsPage,
    prisma = realPrisma,
    createUser = UserService.create.bind(UserService),
    sendEmail = realSendEmail,
    audit = AuditService.log.bind(AuditService),
    sleep = defaultSleep,
    now = Date.now,
    logout = logoutIRecursos,
  } = deps;

  // ── Validación de opciones ──────────────────────────────────────────
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new Error("MAX_PAGES_INVALID");
  }
  if (options.maxPages > MAX_PAGES_HARD_CAP) {
    throw new Error(
      `MAX_PAGES_TOO_HIGH (límite duro: ${MAX_PAGES_HARD_CAP}; pedido: ${options.maxPages})`
    );
  }
  if (
    !Number.isInteger(options.pauseMs) ||
    options.pauseMs < 500 ||
    options.pauseMs > 10_000
  ) {
    throw new Error("PAUSE_MS_OUT_OF_RANGE (500..10000)");
  }
  if (!options.adminUserId) throw new Error("ADMIN_USER_ID_REQUIRED");

  const startedAt = now();

  const stats: BulkImportStats = {
    pagesRequested: options.maxPages,
    pagesProcessed: 0,
    totalPagesInIRecursos: null,
    rowsParsed: 0,
    parseErrors: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    companiesLinkedByNif: 0,
    usersCreated: 0,
    usersSkippedDuplicateEmail: 0,
    companiesNoEmail: 0,
    companiesBadEmail: 0,
    blockedSkipped: 0,
    systemPlaceholderSkipped: 0,
    invitationsSent: 0,
    invitationsPrepared: 0,
    sampleIssues: [],
    durationMs: 0,
    stoppedReason: "max-pages-reached",
  };

  const noteIssue = (codcli: string, kind: string, detail: string) => {
    if (stats.sampleIssues.length < SAMPLE_ISSUES_MAX) {
      stats.sampleIssues.push({ codcli, kind, detail });
    }
  };

  try {
    for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber++) {
      // Pausa ANTES de la siguiente página (no después de la actual). Si
      // el caller cancela, no queda un setTimeout huérfano corriendo.
      if (pageNumber > 1) {
        await sleep(options.pauseMs);
      }

      let page: ParseResult;
      try {
        page = await fetchPage(pageNumber);
      } catch (err) {
        stats.stoppedReason = "page-fetch-error";
        stats.stopError = err instanceof Error ? err.message : String(err);
        break;
      }

      stats.pagesProcessed++;
      if (page.totalPages !== null) {
        stats.totalPagesInIRecursos = page.totalPages;
      }
      stats.rowsParsed += page.clients.length;
      stats.parseErrors += page.errors.length;
      for (const e of page.errors) {
        // Incluimos el snippet en el detail. Sin el snippet, cuando algo
        // raro pasa en producción (estructura de iRecursos cambia, llega
        // HTML que el parser no esperaba) solo veríamos "tbody no
        // encontrado" sin pista de qué llegó. El snippet ya está recortado
        // a 200 chars por el parser.
        noteIssue(
          `p${pageNumber}-row#${e.rowIndex}`,
          "parse-error",
          `${e.reason} | snippet="${e.snippet.replace(/\s+/g, " ").slice(0, 180)}"`
        );
      }

      // Procesar cada cliente de la página, secuencialmente. NO en paralelo:
      // si fallara la BD a mitad de página, queremos saber por qué codcli.
      for (const client of page.clients) {
        try {
          await processClient(client, {
            sendOnboardingEmails: options.sendOnboardingEmails,
            prisma,
            createUser,
            sendEmail,
            stats,
            noteIssue,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          noteIssue(client.codcli, "client-processing-error", msg);
        }
      }

      // Stop temprano si iRecursos dice que ya estamos en la última página
      if (
        page.totalPages !== null &&
        pageNumber >= page.totalPages
      ) {
        stats.stoppedReason = "total-pages-reached";
        break;
      }

      // Stop temprano si la página viene vacía (defensa adicional)
      if (page.clients.length === 0 && page.errors.length === 0) {
        stats.stoppedReason = "empty-page";
        break;
      }
    }

    stats.durationMs = now() - startedAt;

    await audit({
      action: "bulk_import.irecursos",
      userId: options.adminUserId,
      entityType: undefined,
      entityId: undefined,
      metadata: {
        options: {
          maxPages: options.maxPages,
          pauseMs: options.pauseMs,
          sendOnboardingEmails: options.sendOnboardingEmails,
        },
        stats: {
          pagesRequested: stats.pagesRequested,
          pagesProcessed: stats.pagesProcessed,
          totalPagesInIRecursos: stats.totalPagesInIRecursos,
          rowsParsed: stats.rowsParsed,
          parseErrors: stats.parseErrors,
          companiesCreated: stats.companiesCreated,
          companiesUpdated: stats.companiesUpdated,
          companiesLinkedByNif: stats.companiesLinkedByNif,
          usersCreated: stats.usersCreated,
          usersSkippedDuplicateEmail: stats.usersSkippedDuplicateEmail,
          companiesNoEmail: stats.companiesNoEmail,
          companiesBadEmail: stats.companiesBadEmail,
          blockedSkipped: stats.blockedSkipped,
          systemPlaceholderSkipped: stats.systemPlaceholderSkipped,
          invitationsSent: stats.invitationsSent,
          invitationsPrepared: stats.invitationsPrepared,
          durationMs: stats.durationMs,
          stoppedReason: stats.stoppedReason,
          stopError: stats.stopError,
        },
        sampleIssues: stats.sampleIssues,
      },
    });

    return stats;
  } catch (err) {
    stats.durationMs = now() - startedAt;
    stats.stoppedReason = "page-fetch-error";
    stats.stopError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // SIEMPRE cerrar la sesión de iRecursos al terminar, pase lo que
    // pase (éxito, error de página, excepción de BD, lo que sea).
    // iRecursos limita las sesiones concurrentes y NO las cierra solo;
    // dejarlas abiertas consume slots de licencia y nos bloquea el
    // siguiente uso. `logout` es tolerante a fallos (no relanza), así
    // que este `await` no puede romper el flujo del caller.
    await logout();
  }
}

interface ProcessClientCtx {
  sendOnboardingEmails: boolean;
  prisma: typeof realPrisma;
  createUser: typeof UserService.create;
  sendEmail: typeof realSendEmail;
  stats: BulkImportStats;
  noteIssue: (codcli: string, kind: string, detail: string) => void;
}

async function processClient(
  client: import("@/lib/irecursos/parse-modal-clients").ParsedClient,
  ctx: ProcessClientCtx
): Promise<void> {
  const { stats, noteIssue, prisma, createUser, sendEmail } = ctx;
  const codcli = client.codcli;

  // ── Skip: placeholder de sistema (codcli "0" = CLIENTES VARIOS) ─────
  if (SYSTEM_PLACEHOLDER_CODCLIS.has(codcli)) {
    stats.systemPlaceholderSkipped++;
    return;
  }

  // ── Skip: cliente bloqueado en iRecursos ────────────────────────────
  // Decisión: ni Company ni User. Un cliente bloqueado en iRecursos no
  // debería tener cuenta en el portal — si más tarde se desbloquea, una
  // siguiente importación lo creará.
  if (client.blocked) {
    stats.blockedSkipped++;
    noteIssue(codcli, "blocked", client.name);
    return;
  }

  // ── Upsert de Company ──────────────────────────────────────────────
  // Match priority:
  //   1) irecursosClientId (codcli) — clave única, fuente de verdad.
  //   2) taxId == NIF Y irecursosClientId == null — empresa creada a mano
  //      antes de la importación; la enlazamos a su codcli.
  //   3) Nada → crear.
  const company = await upsertCompany(client, prisma, stats, noteIssue);

  // ── Usuario CLIENT ──────────────────────────────────────────────────
  if (!client.email) {
    stats.companiesNoEmail++;
    noteIssue(codcli, "no-email", client.name);
    return;
  }

  const { firstName, lastName } = deriveUserName(client.name);

  try {
    const { user, tempPassword } = await createUser({
      email: client.email,
      firstName,
      lastName,
      role: "CLIENT",
      companyId: company.id,
    });

    stats.usersCreated++;

    // SIEMPRE construimos el email — eso cumple "prepara el email". La
    // plantilla se renderiza y validamos en cada importación que no falla
    // (si la plantilla rompe, nos enteramos sin enviar nada al cliente).
    const invitation = userInvitation({
      firstName,
      email: user.email,
      tempPassword,
    });

    if (ctx.sendOnboardingEmails) {
      try {
        await sendEmail({
          to: user.email,
          subject: invitation.subject,
          html: invitation.html,
          tracking: { kind: "user.invitation" },
        });
        stats.invitationsSent++;
      } catch (err) {
        // Email falla pero el usuario YA está creado — lo notamos pero no
        // tiramos la importación. El admin podrá reenviar desde el panel.
        noteIssue(
          codcli,
          "email-send-failed",
          err instanceof Error ? err.message : String(err)
        );
      }
    } else {
      // Se descarta tempPassword al salir del scope. Para activar luego
      // el envío, el admin usa "Resetear contraseña" en /admin/usuarios:
      // genera una NUEVA contraseña aleatoria y envía la invitación.
      stats.invitationsPrepared++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EMAIL_ALREADY_EXISTS") {
      stats.usersSkippedDuplicateEmail++;
      noteIssue(codcli, "user-duplicate-email", client.email);
      return;
    }
    throw err;
  }
}

async function upsertCompany(
  client: import("@/lib/irecursos/parse-modal-clients").ParsedClient,
  prisma: typeof realPrisma,
  stats: BulkImportStats,
  noteIssue: (codcli: string, kind: string, detail: string) => void
): Promise<{ id: string }> {
  const codcli = client.codcli;
  const nif = client.nif.trim() || null;
  const name = client.name.trim() || client.organization.trim() || `Cliente ${codcli}`;

  // (1) Match por codcli
  const byCodcli = await prisma.company.findUnique({
    where: { irecursosClientId: codcli },
    select: { id: true },
  });

  if (byCodcli) {
    await prisma.company.update({
      where: { id: byCodcli.id },
      data: {
        name,
        taxId: nif,
        isActive: true,
      },
    });
    stats.companiesUpdated++;
    return byCodcli;
  }

  // (2) Match por NIF (solo si existe NIF y la empresa NO está ya vinculada
  // a otro codcli). taxId no es @unique, así que `findFirst`.
  if (nif) {
    const byNif = await prisma.company.findFirst({
      where: { taxId: nif, irecursosClientId: null },
      select: { id: true },
    });
    if (byNif) {
      // El cache de contratos pertenecía al codcli anterior (null) —
      // ahora apunta a uno distinto, invalidamos por seguridad.
      // Casteamos a Record para poder asignar null al campo Json (mismo
      // patrón que /api/companies/[id]/route.ts).
      const updateData: Record<string, unknown> = {
        name,
        irecursosClientId: codcli,
        isActive: true,
        cachedContracts: null,
        cachedContractsAt: null,
      };
      await prisma.company.update({
        where: { id: byNif.id },
        data: updateData,
      });
      stats.companiesUpdated++;
      stats.companiesLinkedByNif++;
      noteIssue(codcli, "company-linked-by-nif", `nif=${nif}`);
      return byNif;
    }
  }

  // (3) Crear nueva
  const created = await prisma.company.create({
    data: {
      name,
      taxId: nif,
      irecursosClientId: codcli,
      isActive: true,
    },
    select: { id: true },
  });
  stats.companiesCreated++;
  return created;
}

// ──────────────────────────────────────────────────────────────────────
// TODO (post-demo): endpoint compañero `send-pending-invitations`.
// Cuando la empresa quiera activar el envío masivo:
//   1) buscar User where mustChangePassword=true AND lastLoginAt=null
//      AND createdAt >= <fecha del import>
//   2) para cada uno: UserService.resetPassword(id) → genera contraseña
//      NUEVA y envía el email de invitación con la plantilla existente
//   3) audit log: "bulk_import.send_pending_invitations"
// No implementado ahora porque estamos en demo y no enviamos emails a
// clientes reales. La plantilla y el flow ya están listos.
// ──────────────────────────────────────────────────────────────────────
