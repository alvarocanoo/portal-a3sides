/**
 * Tests sintéticos de la capa de presentación CLIENT:
 *   - Mapeo de estados (statusLabelFor / statusClassFor) por rol.
 *   - Expansión del filtro de estado del CLIENT (expandClientStatusFilter).
 *   - Validador del query: acepta los 6 reales + 3 pseudo, rechaza inventados.
 *
 * Puros: no tocan BD ni HTTP.
 * Ejecutar: npx tsx tests/client-presentation.mts
 */

import {
  IncidentStatus,
  CLIENT_STATUS_OPTIONS,
  CLIENT_STATUS_PSEUDO,
  STAFF_STATUS_OPTIONS,
  STAFF_STATUS_PSEUDO,
  expandClientStatusFilter,
  expandStaffStatusFilter,
  statusLabelFor,
  statusClassFor,
} from "../src/lib/incident-states.ts";
import { Role } from "../src/types/index.ts";
import { listIncidentsQuerySchema } from "../src/lib/validators/incident.ts";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
    fails.push(name);
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

// ────────────────────────────────────────────────────────────────────
// statusLabelFor / statusClassFor — context-aware
// ────────────────────────────────────────────────────────────────────
console.log("=== statusLabelFor / statusClassFor ===\n");

// CLIENT ve los labels agrupados
eq(`CLIENT: RESOLVED → "Cerrada"`, statusLabelFor(Role.CLIENT, "RESOLVED"), "Cerrada");
eq(`CLIENT: CLOSED → "Cerrada"`, statusLabelFor(Role.CLIENT, "CLOSED"), "Cerrada");
eq(
  `CLIENT: WAITING_THIRD_PARTY → "En proceso"`,
  statusLabelFor(Role.CLIENT, "WAITING_THIRD_PARTY"),
  "En proceso"
);
eq(
  `CLIENT: IN_PROGRESS → "En proceso"`,
  statusLabelFor(Role.CLIENT, "IN_PROGRESS"),
  "En proceso"
);
eq(
  `CLIENT: WAITING_CLIENT → "Esperando tu respuesta"`,
  statusLabelFor(Role.CLIENT, "WAITING_CLIENT"),
  "Esperando tu respuesta"
);
eq(`CLIENT: OPEN → "Abierta"`, statusLabelFor(Role.CLIENT, "OPEN"), "Abierta");

// AGENT ve los labels reales (sin cambios)
eq(`AGENT: RESOLVED → "Resuelta"`, statusLabelFor(Role.AGENT, "RESOLVED"), "Resuelta");
eq(`AGENT: CLOSED → "Cerrada"`, statusLabelFor(Role.AGENT, "CLOSED"), "Cerrada");
eq(
  `AGENT: WAITING_THIRD_PARTY → "Esp. tercero"`,
  statusLabelFor(Role.AGENT, "WAITING_THIRD_PARTY"),
  "Esp. tercero"
);
eq(
  `AGENT: WAITING_CLIENT → "Esp. cliente"`,
  statusLabelFor(Role.AGENT, "WAITING_CLIENT"),
  "Esp. cliente"
);
eq(`AGENT: IN_PROGRESS → "En curso"`, statusLabelFor(Role.AGENT, "IN_PROGRESS"), "En curso");

// ADMIN se comporta igual que AGENT
eq(`ADMIN: RESOLVED → "Resuelta"`, statusLabelFor(Role.ADMIN, "RESOLVED"), "Resuelta");
eq(
  `ADMIN: IN_PROGRESS → "En curso"`,
  statusLabelFor(Role.ADMIN, "IN_PROGRESS"),
  "En curso"
);

// className también se comparte: CLIENT debe usar el azul (IN_PROGRESS) para
// WAITING_THIRD_PARTY (que internamente sería morado).
assert(
  `CLIENT: WAITING_THIRD_PARTY className es azul (mismo que IN_PROGRESS)`,
  statusClassFor(Role.CLIENT, "WAITING_THIRD_PARTY") ===
    statusClassFor(Role.CLIENT, "IN_PROGRESS")
);
assert(
  `CLIENT: RESOLVED className es gris (mismo que CLOSED)`,
  statusClassFor(Role.CLIENT, "RESOLVED") ===
    statusClassFor(Role.CLIENT, "CLOSED")
);
assert(
  `AGENT: WAITING_THIRD_PARTY className NO coincide con IN_PROGRESS`,
  statusClassFor(Role.AGENT, "WAITING_THIRD_PARTY") !==
    statusClassFor(Role.AGENT, "IN_PROGRESS")
);

// Estado desconocido (defensivo)
eq(
  `CLIENT: estado desconocido se devuelve tal cual`,
  statusLabelFor(Role.CLIENT, "FOO"),
  "FOO"
);

// ────────────────────────────────────────────────────────────────────
// expandClientStatusFilter
// ────────────────────────────────────────────────────────────────────
console.log("\n=== expandClientStatusFilter ===\n");

// "" → 4 activas (sin RESOLVED ni CLOSED)
eq(`"" → 4 activas`, expandClientStatusFilter(""), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// undefined → mismo que "" (por defecto activas)
eq(`undefined → 4 activas`, expandClientStatusFilter(undefined), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// IN_PROCESS → IN_PROGRESS + WAITING_THIRD_PARTY
eq(`"IN_PROCESS" → IN_PROGRESS + WAITING_THIRD_PARTY`, expandClientStatusFilter("IN_PROCESS"), [
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// CLOSED_GROUP → RESOLVED + CLOSED
eq(`"CLOSED_GROUP" → RESOLVED + CLOSED`, expandClientStatusFilter("CLOSED_GROUP"), [
  IncidentStatus.RESOLVED,
  IncidentStatus.CLOSED,
]);

// ALL → undefined (sin filtro)
eq(`"ALL" → undefined`, expandClientStatusFilter("ALL"), undefined);

// OPEN → "OPEN" directo
eq(`"OPEN" → "OPEN"`, expandClientStatusFilter("OPEN"), IncidentStatus.OPEN);

// WAITING_CLIENT → directo
eq(
  `"WAITING_CLIENT" → "WAITING_CLIENT"`,
  expandClientStatusFilter("WAITING_CLIENT"),
  IncidentStatus.WAITING_CLIENT
);

// Defensivo: un IncidentStatus real que no esté en el dropdown del CLIENT
// (e.g. "RESOLVED" suelto en la URL) se trata como filtro directo, no
// como pseudo-default. AGENT podría haber compartido una URL.
eq(
  `"RESOLVED" → "RESOLVED" (defensivo)`,
  expandClientStatusFilter("RESOLVED"),
  IncidentStatus.RESOLVED
);

// Defensivo: valor inventado cae a "Activas" (no rompe la lista)
eq(`"FOO" → 4 activas (defensivo)`, expandClientStatusFilter("FOO"), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// ────────────────────────────────────────────────────────────────────
// CLIENT_STATUS_OPTIONS — 6 opciones en el orden esperado
// ────────────────────────────────────────────────────────────────────
console.log("\n=== CLIENT_STATUS_OPTIONS ===\n");

eq(`6 opciones en el dropdown del cliente`, CLIENT_STATUS_OPTIONS.length, 6);
eq(`primera opción es "Activas" con value ""`, CLIENT_STATUS_OPTIONS[0], {
  value: "",
  label: "Activas",
});
assert(
  `"Cerradas" usa pseudo CLOSED_GROUP`,
  CLIENT_STATUS_OPTIONS.some(
    (o) => o.value === CLIENT_STATUS_PSEUDO.CLOSED_GROUP && o.label === "Cerradas"
  )
);
assert(
  `"En proceso" usa pseudo IN_PROCESS`,
  CLIENT_STATUS_OPTIONS.some(
    (o) => o.value === CLIENT_STATUS_PSEUDO.IN_PROCESS && o.label === "En proceso"
  )
);
assert(
  `"Todas (incluye cerradas)" usa pseudo ALL`,
  CLIENT_STATUS_OPTIONS.some(
    (o) => o.value === CLIENT_STATUS_PSEUDO.ALL && o.label.startsWith("Todas")
  )
);

// ────────────────────────────────────────────────────────────────────
// Validador del query: acepta los 6 reales + 3 pseudo
// ────────────────────────────────────────────────────────────────────
console.log("\n=== listIncidentsQuerySchema ===\n");

// Los 6 reales siguen siendo válidos (no se rompe AGENT/ADMIN)
for (const v of [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "WAITING_THIRD_PARTY",
  "RESOLVED",
  "CLOSED",
]) {
  const r = listIncidentsQuerySchema.safeParse({ status: v });
  assert(`acepta status="${v}"`, r.success);
}

// Los 3 pseudo
for (const v of ["IN_PROCESS", "CLOSED_GROUP", "ALL"]) {
  const r = listIncidentsQuerySchema.safeParse({ status: v });
  assert(`acepta pseudo status="${v}"`, r.success);
}

// Valor inventado rechazado
{
  const r = listIncidentsQuerySchema.safeParse({ status: "FOO" });
  assert(`rechaza status="FOO"`, !r.success);
}
{
  const r = listIncidentsQuerySchema.safeParse({ status: "CRITICAL" });
  assert(`rechaza status="CRITICAL" (es una prioridad, no un estado)`, !r.success);
}

// status omitido sigue siendo válido (default)
{
  const r = listIncidentsQuerySchema.safeParse({});
  assert(`status omitido válido`, r.success);
}

// ────────────────────────────────────────────────────────────────────
// expandStaffStatusFilter (AGENT/ADMIN)
// ────────────────────────────────────────────────────────────────────
console.log("\n=== expandStaffStatusFilter ===\n");

// "" / undefined → 4 activas (oculta cerradas — comportamiento por defecto)
eq(`STAFF "" → 4 activas`, expandStaffStatusFilter(""), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);
eq(`STAFF undefined → 4 activas`, expandStaffStatusFilter(undefined), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// ALL → undefined (sin filtro)
eq(`STAFF "ALL" → undefined`, expandStaffStatusFilter("ALL"), undefined);

// Estados reales → filtro directo (cada uno)
for (const s of [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
  IncidentStatus.RESOLVED,
  IncidentStatus.CLOSED,
]) {
  eq(`STAFF "${s}" → "${s}" directo`, expandStaffStatusFilter(s), s);
}

// Pseudos del CLIENT son tolerados (defensa contra A2 — admin que pega
// una URL compartida por un cliente). Mismo expansion que para CLIENT.
eq(
  `STAFF "IN_PROCESS" (pseudo CLIENT) → IN_PROGRESS + WAITING_THIRD_PARTY`,
  expandStaffStatusFilter(CLIENT_STATUS_PSEUDO.IN_PROCESS),
  [IncidentStatus.IN_PROGRESS, IncidentStatus.WAITING_THIRD_PARTY]
);
eq(
  `STAFF "CLOSED_GROUP" (pseudo CLIENT) → RESOLVED + CLOSED`,
  expandStaffStatusFilter(CLIENT_STATUS_PSEUDO.CLOSED_GROUP),
  [IncidentStatus.RESOLVED, IncidentStatus.CLOSED]
);

// Valor desconocido cae a "Activas" (defensivo)
eq(`STAFF "FOO" → 4 activas (defensivo)`, expandStaffStatusFilter("FOO"), [
  IncidentStatus.OPEN,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.WAITING_CLIENT,
  IncidentStatus.WAITING_THIRD_PARTY,
]);

// ────────────────────────────────────────────────────────────────────
// STAFF_STATUS_OPTIONS — 8 opciones (Activas + 6 reales + ALL)
// ────────────────────────────────────────────────────────────────────
console.log("\n=== STAFF_STATUS_OPTIONS ===\n");

eq(`8 opciones en el dropdown del staff`, STAFF_STATUS_OPTIONS.length, 8);
eq(
  `primera opción es "Activas" con value ""`,
  STAFF_STATUS_OPTIONS[0],
  { value: "", label: "Activas" }
);
assert(
  `incluye los 6 estados reales con sus labels reales`,
  ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY", "RESOLVED", "CLOSED"]
    .every((s) => STAFF_STATUS_OPTIONS.some((o) => o.value === s))
);
assert(
  `incluye "Esp. cliente" (label real, no agrupado)`,
  STAFF_STATUS_OPTIONS.some((o) => o.label === "Esp. cliente")
);
assert(
  `incluye "Esp. tercero" (label real, no agrupado)`,
  STAFF_STATUS_OPTIONS.some((o) => o.label === "Esp. tercero")
);
assert(
  `"Todas (incluye cerradas)" usa pseudo ALL`,
  STAFF_STATUS_OPTIONS.some(
    (o) => o.value === STAFF_STATUS_PSEUDO.ALL && o.label.startsWith("Todas")
  )
);

// ────────────────────────────────────────────────────────────────────
// Bug A1 — validator acepta status="" como undefined
// ────────────────────────────────────────────────────────────────────
console.log("\n=== Bug A1: validator acepta status=\"\" ===\n");

{
  const r = listIncidentsQuerySchema.safeParse({ status: "" });
  assert(`status="" NO se rechaza con 400`, r.success);
  if (r.success) {
    eq(`status="" → preprocess a undefined`, r.data.status, undefined);
  }
}
{
  const r = listIncidentsQuerySchema.safeParse({ priority: "" });
  assert(`priority="" NO se rechaza con 400`, r.success);
  if (r.success) {
    eq(`priority="" → preprocess a undefined`, r.data.priority, undefined);
  }
}
// Combinaciones con "" y valores legítimos
{
  const r = listIncidentsQuerySchema.safeParse({
    status: "",
    priority: "HIGH",
    search: "x",
  });
  assert(`status="" + priority="HIGH" + search="x" parsea OK`, r.success);
  if (r.success) {
    eq(`status preprocessed`, r.data.status, undefined);
    eq(`priority intacta`, r.data.priority, "HIGH");
    eq(`search intacta`, r.data.search, "x");
  }
}

// ────────────────────────────────────────────────────────────────────
console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
if (fails.length > 0) {
  console.log("\nFallos:");
  for (const f of fails) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
