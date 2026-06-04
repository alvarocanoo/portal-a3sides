import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { ALLOWED_MIME_TYPES } from "./mime-types";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE =
  parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10) * 1024 * 1024;

// Re-exportamos para no romper a quien ya importara desde "@/lib/storage";
// la fuente única de verdad vive en ./mime-types.
export { ALLOWED_MIME_TYPES };

const ALLOWED_SET = new Set<string>(ALLOWED_MIME_TYPES);

export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE;
export const MAX_FILE_SIZE_MB = parseInt(
  process.env.MAX_FILE_SIZE_MB || "10",
  10
);

export class UploadError extends Error {
  constructor(public code: UploadErrorCode, message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadErrorCode =
  | "TOO_LARGE"
  | "MIME_NOT_ALLOWED"
  | "MIME_MISMATCH"
  | "INVALID_NAME"
  | "EMPTY_FILE";

export interface UploadResult {
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

// Magic bytes para validar que el archivo es realmente del tipo declarado
function detectMagic(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  const b = buffer;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  // GIF: 47 49 46 38 (37|39) 61
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  // WebP: RIFF????WEBP
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  // PDF: 25 50 44 46
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  // ZIP-based (docx, xlsx): 50 4B 03 04
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)
    return "application/zip";
  // OLE (doc, xls legacy): D0 CF 11 E0 A1 B1 1A E1
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)
    return "application/x-ole-storage";
  return null;
}

// Comprueba que el contenido coincide razonablemente con el MIME declarado.
// Todos los tipos del allowlist actual tienen magic bytes verificables
// (ver detectMagic). text/plain y text/csv quedaron fuera del allowlist
// precisamente para no tener que confiar en el cliente.
function mimeMatchesContent(declaredMime: string, buffer: Buffer): boolean {
  const detected = detectMagic(buffer);

  if (!detected) return false;

  // Coincidencia directa
  if (detected === declaredMime) return true;

  // Office docx/xlsx son contenedores ZIP
  if (
    detected === "application/zip" &&
    (declaredMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      declaredMime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  )
    return true;

  // Office legacy .doc/.xls son OLE
  if (
    detected === "application/x-ole-storage" &&
    (declaredMime === "application/msword" ||
      declaredMime === "application/vnd.ms-excel")
  )
    return true;

  return false;
}

function sanitizeFileName(name: string): string {
  // Quedarse solo con basename (elimina cualquier "../" o ruta)
  const base = basename(name);
  // Reemplazar todo lo que no sea alfanumerico, punto, guion o subrayado
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Evitar nombres tipo "." o ".."
  const trimmed = cleaned.replace(/^\.+/, "").trim();
  return trimmed.length > 0 ? trimmed : "archivo";
}

export async function uploadFile(
  file: File,
  originalName: string
): Promise<UploadResult> {
  if (file.size === 0) {
    throw new UploadError("EMPTY_FILE", "El archivo está vacío");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError(
      "TOO_LARGE",
      `El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB`
    );
  }

  if (!ALLOWED_SET.has(file.type)) {
    throw new UploadError(
      "MIME_NOT_ALLOWED",
      "Tipo de archivo no permitido"
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validacion por magic bytes: el contenido debe coincidir con el MIME declarado
  if (!mimeMatchesContent(file.type, buffer)) {
    throw new UploadError(
      "MIME_MISMATCH",
      "El contenido del archivo no coincide con su tipo declarado"
    );
  }

  const sanitizedName = sanitizeFileName(originalName);
  if (!sanitizedName) {
    throw new UploadError("INVALID_NAME", "Nombre de archivo no válido");
  }
  const storageKey = `${randomUUID()}_${sanitizedName}`;

  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const filePath = join(UPLOAD_DIR, storageKey);
  await writeFile(filePath, buffer);

  return {
    storageKey,
    fileName: sanitizedName,
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
    // Archivo ya no existe — silencioso
  }
}
