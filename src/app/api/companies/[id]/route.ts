import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { updateCompanySchema } from "@/lib/validators/user";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Guard §1.3: ver explicación en /api/incidents.
    if (session.user.mustChangePassword) {
      return NextResponse.json(
        { error: "DEBE_CAMBIAR_PASSWORD" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateCompanySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Empresa no encontrada" },
        { status: 404 }
      );
    }

    // Normalizamos strings vacíos a null para campos opcionales (taxId,
    // irecursosClientId) — el schema acepta null y permite "limpiar".
    const data: Record<string, unknown> = {
      ...parsed.data,
      taxId: parsed.data.taxId === "" ? null : parsed.data.taxId,
      irecursosClientId:
        parsed.data.irecursosClientId === "" ? null : parsed.data.irecursosClientId,
    };

    // Si cambia el irecursosClientId, invalidamos el cache de contratos:
    // los datos cacheados pertenecen al codcli anterior y no aplicarían
    // al nuevo. Si solo cambian otros campos (nombre, taxId, isActive)
    // el cache se conserva.
    if (
      "irecursosClientId" in parsed.data &&
      data.irecursosClientId !== existing.irecursosClientId
    ) {
      data.cachedContracts = null;
      data.cachedContractsAt = null;
    }

    try {
      const company = await prisma.company.update({
        where: { id },
        data,
      });

      const { ipAddress, userAgent } = getRequestContext(request);
      await AuditService.log({
        action: "company.update",
        userId: session.user.id,
        entityType: "Company",
        entityId: id,
        metadata: { name: company.name, ...parsed.data },
        ipAddress,
        userAgent,
      });

      return NextResponse.json(company);
    } catch (err) {
      // Violación de uniqueness en irecursosClientId
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Ese ID de iRecursos ya está en uso por otra empresa" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
