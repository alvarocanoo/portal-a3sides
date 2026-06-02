/**
 * Tests sintéticos puros del helper formatDuration. Sin BD, sin HTTP.
 * Ejecutar: npx tsx tests/format-duration.mts
 */
import { formatDuration } from "../src/lib/constants.ts";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function eq<T>(name: string, actual: T, expected: T) {
  const ok = actual === expected;
  if (ok) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(`FAIL | ${name} — actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
    failed++;
    fails.push(name);
  }
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

console.log("=== formatDuration (ms) ===\n");

// Minutos
eq("0ms → 0min", formatDuration(0), "0min");
eq("30s → 0min", formatDuration(30_000), "0min");
eq("1min", formatDuration(1 * MIN), "1min");
eq("45min", formatDuration(45 * MIN), "45min");
eq("59min", formatDuration(59 * MIN), "59min");

// Horas (sin minutos sobrantes)
eq("1h", formatDuration(1 * HOUR), "1h");
eq("2h", formatDuration(2 * HOUR), "2h");
eq("23h", formatDuration(23 * HOUR), "23h");

// Horas + minutos
eq("2h 15min", formatDuration(2 * HOUR + 15 * MIN), "2h 15min");
eq("1h 1min", formatDuration(1 * HOUR + 1 * MIN), "1h 1min");
eq("23h 59min", formatDuration(23 * HOUR + 59 * MIN), "23h 59min");

// Días
eq("1d", formatDuration(1 * DAY), "1d");
eq("1d 4h", formatDuration(1 * DAY + 4 * HOUR), "1d 4h");
eq("3d", formatDuration(3 * DAY), "3d");
eq("6d 23h", formatDuration(6 * DAY + 23 * HOUR), "6d 23h");

// Cap: a partir de 7 días, sin horas
eq("7d (sin horas)", formatDuration(7 * DAY + 5 * HOUR), "7d");
eq("30d (sin horas)", formatDuration(30 * DAY + 12 * HOUR), "30d");

// Defensivo: negativos, NaN
eq("negativo → 0min", formatDuration(-1), "0min");
eq("NaN → 0min", formatDuration(NaN), "0min");

console.log("\n=== formatDuration (dos fechas) ===\n");
const start = new Date("2026-06-02T08:00:00Z");
const after45min = new Date("2026-06-02T08:45:00Z");
const after2h15 = new Date("2026-06-02T10:15:00Z");
const after1d4h = new Date("2026-06-03T12:00:00Z");

eq("45min (Date, Date)", formatDuration(start, after45min), "45min");
eq("2h 15min (Date, Date)", formatDuration(start, after2h15), "2h 15min");
eq("1d 4h (Date, Date)", formatDuration(start, after1d4h), "1d 4h");

// Strings ISO
eq("45min (string, string)", formatDuration("2026-06-02T08:00:00Z", "2026-06-02T08:45:00Z"), "45min");

// end ANTES de start → defensivo
eq("end < start → 0min", formatDuration(after45min, start), "0min");

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
if (fails.length) {
  console.log("\nFallos:");
  for (const f of fails) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
