// Identifica y opcionalmente migra incidencias en estado IN_PROGRESS,
// WAITING_CLIENT o WAITING_THIRD_PARTY con assignedToId=null.
// Estas son producto del bug anterior donde "tomar" no asignaba.
//
// Modo de uso:
//   node tests/migrate-inconsistent-assignments.mjs           # solo INFORME
//   node tests/migrate-inconsistent-assignments.mjs --apply   # ejecuta migracion
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const inconsistent = await prisma.incident.findMany({
  where: {
    status: { in: ["IN_PROGRESS", "WAITING_CLIENT", "WAITING_THIRD_PARTY"] },
    assignedToId: null,
  },
  select: {
    id: true,
    reference: true,
    status: true,
    subject: true,
  },
  orderBy: { reference: "asc" },
});

console.log(`Incidencias inconsistentes encontradas: ${inconsistent.length}`);
if (inconsistent.length === 0) {
  console.log("Nada que migrar. La BD ya esta limpia.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("\nListado:");
for (const inc of inconsistent) {
  console.log(`  ${inc.reference} | ${inc.status} | ${inc.subject.slice(0, 50)}`);
}

if (!APPLY) {
  console.log("\nEjecuta con --apply para volverlas a OPEN.");
  console.log("Se anadira un StatusChange con razon explicativa para preservar el audit trail.");
  await prisma.$disconnect();
  process.exit(0);
}

// Buscamos un usuario sistema para firmar la migracion (admin)
const admin = await prisma.user.findFirst({
  where: { role: "ADMIN" },
  select: { id: true },
});
if (!admin) {
  console.error("No hay usuario ADMIN. Aborto.");
  await prisma.$disconnect();
  process.exit(1);
}

console.log(`\nMigrando con admin=${admin.id}...`);
for (const inc of inconsistent) {
  await prisma.$transaction([
    prisma.incident.update({
      where: { id: inc.id },
      data: { status: "OPEN" },
    }),
    prisma.statusChange.create({
      data: {
        fromStatus: inc.status,
        toStatus: "OPEN",
        reason: "Migración: estado en curso sin agente asignado (corregido por fix de auto-asignación)",
        incidentId: inc.id,
        changedById: admin.id,
      },
    }),
  ]);
  console.log(`  ${inc.reference}: ${inc.status} -> OPEN`);
}
console.log(`\nMigracion completada. ${inconsistent.length} incidencias normalizadas.`);

await prisma.$disconnect();
