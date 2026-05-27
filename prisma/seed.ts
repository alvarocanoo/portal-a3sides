import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando seed...");

  // Admin
  const adminHash = await hash("Admin123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@a3sides.es" },
    update: {},
    create: {
      email: "admin@a3sides.es",
      passwordHash: adminHash,
      firstName: "Administrador",
      lastName: "a3sides",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
    },
  });
  console.log(`  Admin creado: ${admin.email}`);

  // Empresa test
  const company = await prisma.company.upsert({
    where: { irecursosClientId: "TEST-001" },
    update: {},
    create: {
      name: "Asesoría Demo S.L.",
      taxId: "B12345678",
      irecursosClientId: "TEST-001",
      isActive: true,
    },
  });
  console.log(`  Empresa creada: ${company.name}`);

  // Agente
  const agenteHash = await hash("Agente123!", 12);
  const agente = await prisma.user.upsert({
    where: { email: "agente@a3sides.es" },
    update: {},
    create: {
      email: "agente@a3sides.es",
      passwordHash: agenteHash,
      firstName: "Agente",
      lastName: "Soporte",
      role: "AGENT",
      isActive: true,
      mustChangePassword: false,
    },
  });
  console.log(`  Agente creado: ${agente.email}`);

  // Cliente
  const clienteHash = await hash("Cliente123!", 12);
  const cliente = await prisma.user.upsert({
    where: { email: "cliente@demo.com" },
    update: {},
    create: {
      email: "cliente@demo.com",
      passwordHash: clienteHash,
      firstName: "María",
      lastName: "García",
      role: "CLIENT",
      companyId: company.id,
      isActive: true,
      mustChangePassword: false,
    },
  });
  console.log(`  Cliente creado: ${cliente.email}`);

  // Incidencias de ejemplo
  const year = new Date().getFullYear();
  const incidents = [
    {
      reference: `INC-${year}-00001`,
      subject: "Error al generar factura en a3FacturaGo",
      description:
        "Al intentar generar una factura con IVA intracomunitario, el sistema muestra un error 500 y no permite guardar el documento.",
      status: "OPEN" as const,
      priority: "HIGH" as const,
      category: "a3FacturaGo",
      companyId: company.id,
      createdById: cliente.id,
    },
    {
      reference: `INC-${year}-00002`,
      subject: "Consulta sobre configuración de suscripciones",
      description:
        "Necesitamos configurar las suscripciones de a3INNUVA Contabilidad para 3 usuarios adicionales. ¿Cuál es el procedimiento?",
      status: "IN_PROGRESS" as const,
      priority: "MEDIUM" as const,
      category: "a3INNUVA Contabilidad",
      companyId: company.id,
      createdById: cliente.id,
      assignedToId: agente.id,
      firstResponseAt: new Date(),
    },
    {
      reference: `INC-${year}-00003`,
      subject: "Problema con traspaso de datos en Connectia",
      description:
        "El traspaso de datos desde el programa de contabilidad a Connectia falla con un error de formato en el campo NIF del proveedor.",
      status: "RESOLVED" as const,
      priority: "MEDIUM" as const,
      category: "a3INNUVA Connectia",
      companyId: company.id,
      createdById: cliente.id,
      assignedToId: agente.id,
      firstResponseAt: new Date(Date.now() - 86400000),
      resolvedAt: new Date(),
    },
  ];

  for (const data of incidents) {
    const incident = await prisma.incident.upsert({
      where: { reference: data.reference },
      update: {},
      create: data,
    });
    console.log(`  Incidencia creada: ${incident.reference} - ${incident.subject}`);
  }

  // Mensaje de ejemplo en la incidencia en curso
  const incidencia2 = await prisma.incident.findUnique({
    where: { reference: `INC-${year}-00002` },
  });
  if (incidencia2) {
    await prisma.message.create({
      data: {
        content:
          "Buenos días. He revisado su cuenta y actualmente tienen la suscripción base de 2 usuarios. Para añadir 3 más, necesito que me confirmen los emails de los nuevos usuarios.",
        isInternal: false,
        incidentId: incidencia2.id,
        authorId: agente.id,
      },
    });

    await prisma.message.create({
      data: {
        content:
          "Nota interna: el cliente tiene contrato vigente hasta diciembre. Verificar con comercial si aplica descuento por volumen.",
        isInternal: true,
        incidentId: incidencia2.id,
        authorId: agente.id,
      },
    });

    await prisma.statusChange.create({
      data: {
        fromStatus: "OPEN",
        toStatus: "IN_PROGRESS",
        reason: "Asignado y en revisión",
        incidentId: incidencia2.id,
        changedById: agente.id,
      },
    });
  }

  console.log("\nSeed completado.");
  console.log("\nCredenciales de prueba:");
  console.log("  Admin:   admin@a3sides.es   / Admin123!");
  console.log("  Agente:  agente@a3sides.es  / Agente123!");
  console.log("  Cliente: cliente@demo.com   / Cliente123!");
}

main()
  .catch((e) => {
    console.error("Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
