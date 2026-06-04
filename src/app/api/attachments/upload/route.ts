import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadFile, UploadError } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Guard §1.3: ver explicación en /api/incidents.
    if (session.user.mustChangePassword) {
      return NextResponse.json(
        { error: "DEBE_CAMBIAR_PASSWORD" },
        { status: 403 }
      );
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

    if (!incidentId && !messageId) {
      return NextResponse.json(
        { error: "Se requiere incidentId o messageId" },
        { status: 400 }
      );
    }

    // ─── Control de acceso: el archivo SIEMPRE debe terminar atado a una
    //     incidencia a la que el usuario tenga acceso. Si llega solo
    //     messageId, resolvemos su incidencia y aplicamos el mismo check.
    let targetIncidentId = incidentId;

    if (!targetIncidentId && messageId) {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          incidentId: true,
          authorId: true,
          isInternal: true,
        },
      });
      if (!message) {
        return NextResponse.json(
          { error: "Mensaje no encontrado" },
          { status: 404 }
        );
      }
      // Solo el autor del mensaje puede adjuntar a el (para evitar que un
      // tercero anada archivos al mensaje de otro)
      if (message.authorId !== session.user.id) {
        return NextResponse.json(
          { error: "No tienes permiso sobre este mensaje" },
          { status: 403 }
        );
      }
      // Cliente nunca puede adjuntar a notas internas (que no debe ver)
      if (session.user.role === "CLIENT" && message.isInternal) {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
      targetIncidentId = message.incidentId;
    }

    if (targetIncidentId) {
      const incident = await prisma.incident.findUnique({
        where: { id: targetIncidentId },
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
        incidentId: incidentId || null,
        messageId: messageId || null,
        uploadedById: session.user.id,
      },
    });

    return NextResponse.json(
      {
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    // Si Next.js corta el body por exceder el limite del servidor, el
    // parseo del multipart falla con TypeError. Lo traducimos a TOO_LARGE.
    if (error instanceof TypeError && /FormData|body|boundary/i.test(error.message)) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande", code: "TOO_LARGE" },
        { status: 413 }
      );
    }
    console.error("[attachments/upload]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
