import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const incidentId = formData.get("incidentId") as string | null;
    const messageId = formData.get("messageId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se ha proporcionado un archivo" },
        { status: 400 }
      );
    }

    if (incidentId) {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { companyId: true },
      });
      if (!incident) {
        return NextResponse.json(
          { error: "Incidencia no encontrada" },
          { status: 404 }
        );
      }
      if (
        session.user.role === "CLIENT" &&
        incident.companyId !== session.user.companyId
      ) {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
    }

    const result = await uploadFile(file, file.name);

    const attachment = await prisma.attachment.create({
      data: {
        fileName: result.fileName,
        fileSize: result.fileSize,
        mimeType: result.mimeType,
        storageKey: result.storageKey,
        incidentId,
        messageId,
        uploadedById: session.user.id,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("límite") ||
        error.message.includes("no permitido")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
