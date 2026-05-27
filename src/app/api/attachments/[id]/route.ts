import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFile } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        incident: { select: { companyId: true } },
        message: {
          select: {
            isInternal: true,
            incident: { select: { companyId: true } },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    if (session.user.role === "CLIENT") {
      const companyId =
        attachment.incident?.companyId ||
        attachment.message?.incident?.companyId;
      if (companyId !== session.user.companyId) {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
      if (attachment.message?.isInternal) {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
    }

    const fileBuffer = await getFile(attachment.storageKey);
    const uint8 = new Uint8Array(fileBuffer);

    return new Response(uint8, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Content-Length": attachment.fileSize.toString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
