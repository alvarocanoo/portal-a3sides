/**
 * Tests sintéticos del rediseño de prioridad. Solo Zod validators —
 * son puros, no tocan BD ni HTTP.
 *
 * Ejecutar: npx tsx tests/incident-priority.mts
 *
 * Cobertura:
 *   - createIncidentSchema descarta `priority` si llega en el body (capa A
 *     de la defensa en profundidad).
 *   - updateIncidentPrioritySchema acepta los 4 valores válidos y rechaza
 *     cualquier otro.
 *
 * NO cubierto aquí (tiene su propio script):
 *   - IncidentService.changePriority (capa C — test funcional con BD)
 *   - Endpoint PATCH /api/incidents/[id]/priority (capa B — verificación
 *     manual del usuario con server reiniciado, ver instrucciones del
 *     resumen final).
 */

import {
  createIncidentSchema,
  updateIncidentPrioritySchema,
} from "../src/lib/validators/incident.ts";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
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

console.log("=== createIncidentSchema (capa A: descarta priority) ===\n");

// (1) CLIENT mandando priority es ignorado: parsed.data NO debe contenerla
{
  const result = createIncidentSchema.safeParse({
    subject: "Asunto válido de prueba",
    description: "Descripción suficientemente larga para pasar el min(10).",
    priority: "CRITICAL", // ← el cliente intenta forzar
    category: "Otro",
  });
  assert("body con priority extra parsea OK", result.success);
  if (result.success) {
    // El schema no incluye `priority`. Por defecto Zod NO añade campos
    // que no estén declarados. parsed.data no debería tener la key.
    const hasPriority = "priority" in result.data;
    assert(
      "parsed.data NO contiene la key 'priority' (descartada por Zod)",
      !hasPriority
    );
  }
}

// (2) Body limpio sin priority parsea OK
{
  const result = createIncidentSchema.safeParse({
    subject: "Otro asunto",
    description: "Otra descripción de longitud suficiente.",
    category: "a3FacturaGo",
  });
  assert("body sin priority parsea OK", result.success);
  if (result.success) {
    assert(
      "parsed.data NO contiene priority (ni cuando no se manda)",
      !("priority" in result.data)
    );
  }
}

// (3) Subject corto rechazado (regresión: cambiar el schema no debe
//     romper otras validaciones)
{
  const result = createIncidentSchema.safeParse({
    subject: "x", // < 5 chars
    description: "Descripción suficientemente larga.",
  });
  assert("subject corto rechazado", !result.success);
}

// (4) Descripción corta rechazada
{
  const result = createIncidentSchema.safeParse({
    subject: "Asunto razonable",
    description: "corta",
  });
  assert("descripción corta rechazada", !result.success);
}

console.log("\n=== updateIncidentPrioritySchema (cambio AGENT/ADMIN) ===\n");

// (5) Los 4 valores válidos pasan
for (const p of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
  const result = updateIncidentPrioritySchema.safeParse({ priority: p });
  assert(`priority="${p}" aceptada`, result.success);
  if (result.success) {
    eq(`priority="${p}" devuelve mismo valor`, result.data.priority, p);
  }
}

// (6) Valor inválido rechazado
{
  const result = updateIncidentPrioritySchema.safeParse({
    priority: "URGENT",
  });
  assert("priority='URGENT' rechazada", !result.success);
}

// (7) Falta el campo priority
{
  const result = updateIncidentPrioritySchema.safeParse({});
  assert("body sin priority rechazado", !result.success);
}

// (8) Campos extra son descartados (no .strict())
{
  const result = updateIncidentPrioritySchema.safeParse({
    priority: "HIGH",
    extraField: "ignored",
  });
  assert("body con campos extra parsea OK", result.success);
  if (result.success) {
    assert(
      "campos extra NO aparecen en parsed.data",
      !("extraField" in result.data)
    );
  }
}

// (9) Tipo incorrecto
{
  const result = updateIncidentPrioritySchema.safeParse({
    priority: 1,
  });
  assert("priority numérica rechazada", !result.success);
}

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
