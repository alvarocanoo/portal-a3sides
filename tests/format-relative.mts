/**
 * Tests sintéticos puros del helper formatRelative. Sin BD, sin HTTP.
 * Ejecutar: npx tsx tests/format-relative.mts
 */
import { formatRelative } from "../src/lib/constants.ts";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function eq(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (ok) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(
      `FAIL | ${name} — actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
    );
    failed++;
    fails.push(name);
  }
}

function match(name: string, actual: string, pattern: RegExp) {
  const ok = pattern.test(actual);
  if (ok) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(
      `FAIL | ${name} — actual=${JSON.stringify(actual)} pattern=${pattern}`
    );
    failed++;
    fails.push(name);
  }
}

const NOW = Date.now();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms);
const future = (ms: number) => new Date(NOW + ms);

console.log("=== formatRelative ===\n");

// Casos del segmento "hace un momento" (< 1 min).
eq("0 ms → hace un momento", formatRelative(ago(0)), "hace un momento");
eq("30 s → hace un momento", formatRelative(ago(30 * SEC)), "hace un momento");
eq("59 s → hace un momento", formatRelative(ago(59 * SEC)), "hace un momento");

// "hace X min" (1..59).
eq("60 s → hace 1 min", formatRelative(ago(60 * SEC)), "hace 1 min");
eq("90 s → hace 1 min (floor)", formatRelative(ago(90 * SEC)), "hace 1 min");
eq("5 min → hace 5 min", formatRelative(ago(5 * MIN)), "hace 5 min");
eq("59 min → hace 59 min", formatRelative(ago(59 * MIN)), "hace 59 min");

// "hace X h" (1..23).
eq("60 min → hace 1 h", formatRelative(ago(60 * MIN)), "hace 1 h");
eq("90 min → hace 1 h (floor)", formatRelative(ago(90 * MIN)), "hace 1 h");
eq("2 h → hace 2 h", formatRelative(ago(2 * HOUR)), "hace 2 h");
eq(
  "23 h 59 min → hace 23 h",
  formatRelative(ago(23 * HOUR + 59 * MIN)),
  "hace 23 h"
);

// "hace X día(s)" — flexión en este único caso.
eq("24 h → hace 1 día", formatRelative(ago(24 * HOUR)), "hace 1 día");
eq("48 h → hace 2 días", formatRelative(ago(48 * HOUR)), "hace 2 días");
eq("3 días → hace 3 días", formatRelative(ago(3 * DAY)), "hace 3 días");
eq(
  "6 días 23 h → hace 6 días",
  formatRelative(ago(6 * DAY + 23 * HOUR)),
  "hace 6 días"
);

// ≥ 7 días → cae a fecha absoluta (formatDate, "12 mar 2026").
// No comprobamos texto exacto (depende del locale del runtime), pero SÍ
// que NO empieza por "hace" — sería un fallo del umbral.
match("7 días → fecha absoluta (no empieza por 'hace')", formatRelative(ago(7 * DAY)), /^(?!hace )/);
match("30 días → fecha absoluta", formatRelative(ago(30 * DAY)), /^(?!hace )/);
match("1 año → fecha absoluta", formatRelative(ago(365 * DAY)), /^(?!hace )/);

// Defensivo: futuro → fecha absoluta (no "hace -3 min").
match("Futuro +1 min → fecha absoluta", formatRelative(future(MIN)), /^(?!hace )/);
match("Futuro +1 día → fecha absoluta", formatRelative(future(DAY)), /^(?!hace )/);

// Defensivo: Invalid Date.
// `new Date("xxx")` da Invalid Date; formatDate(d) lo formatea como
// "Invalid Date" en la mayoría de locales JS. Comprobamos que NO
// devuelve "hace ...", que es el comportamiento que queremos garantizar.
match(
  "Invalid Date → no devuelve 'hace ...'",
  formatRelative("not-a-date"),
  /^(?!hace )/
);

// Strings ISO también.
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();
eq("ISO 5 min → hace 5 min", formatRelative(isoAgo(5 * MIN)), "hace 5 min");
eq("ISO 2 días → hace 2 días", formatRelative(isoAgo(2 * DAY)), "hace 2 días");

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
if (fails.length) {
  console.log("\nFallos:");
  for (const f of fails) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
