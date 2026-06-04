// ─────────────────────────────────────────────────────────────────────
// Tipos MIME permitidos para adjuntos — FUENTE ÚNICA DE VERDAD.
//
// Esta lista la consumen DOS sitios y es crítico que estén sincronizados:
//   - backend (src/lib/storage/index.ts) — valida en POST /api/attachments
//     y rechaza con MIME_NOT_ALLOWED si el tipo no está aquí.
//   - frontend (src/components/incidents/file-uploader.tsx) — valida en
//     cliente para feedback inmediato y filtra el selector de archivos
//     vía el atributo `accept` del <input type="file">.
//
// Este módulo NO importa nada de Node (fs/path/etc.) para que sea seguro
// importarlo desde un Client Component sin arrastrar el bundle al cliente.
// ─────────────────────────────────────────────────────────────────────

// Lista deliberadamente restringida: solo formatos con magic bytes
// verificables. text/plain y text/csv NO están porque no tienen magic
// bytes (cualquier binario disfrazado de text/plain se cuela y se
// descarga al receptor con el Content-Type declarado por el atacante).
// Si se necesita compartir texto, copiar/pegar en un mensaje del ticket
// es preferible a un adjunto sin verificar.
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Subset de ALLOWED_MIME_TYPES que se pueden previsualizar como imagen
// inline en el detalle. Enumeración EXPLÍCITA — no derivarse de
// `mime.startsWith("image/")` para que un futuro `image/svg+xml` en el
// allowlist no abra automáticamente vector XSS por SVG con <script>.
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export function isImageMime(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}
