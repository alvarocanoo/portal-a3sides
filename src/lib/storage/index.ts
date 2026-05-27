import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10)) * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export interface UploadResult {
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function uploadFile(
  file: File,
  originalName: string
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`El archivo supera el límite de ${process.env.MAX_FILE_SIZE_MB || 10} MB`);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de archivo no permitido");
  }

  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${randomUUID()}_${sanitizedName}`;

  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(UPLOAD_DIR, storageKey);
  await writeFile(filePath, buffer);

  return {
    storageKey,
    fileName: originalName,
    fileSize: file.size,
    mimeType: file.type,
  };
}

export async function getFile(storageKey: string): Promise<Buffer> {
  const filePath = join(UPLOAD_DIR, storageKey);
  return readFile(filePath);
}

export async function deleteFile(storageKey: string): Promise<void> {
  const filePath = join(UPLOAD_DIR, storageKey);
  try {
    await unlink(filePath);
  } catch {
    // Archivo ya no existe
  }
}
