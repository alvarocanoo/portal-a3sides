export interface UploadProgress {
  uploaded: number;
  total: number;
  percent: number;
}

export type UploadResult =
  | { ok: true; id: string; fileName: string }
  | { ok: false; error: string };

/**
 * Sube un fichero al endpoint POST /api/attachments/upload con progreso real.
 * Asocia el archivo a `incidentId` o `messageId`. El backend valida acceso,
 * MIME, tamano y magic bytes.
 */
export function uploadAttachment(params: {
  file: File;
  incidentId?: string;
  messageId?: string;
  onProgress?: (p: UploadProgress) => void;
}): Promise<UploadResult> {
  const { file, incidentId, messageId, onProgress } = params;

  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("file", file);
    if (incidentId) formData.append("incidentId", incidentId);
    if (messageId) formData.append("messageId", messageId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachments/upload");

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            uploaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => {
      // 401 → sesión expirada: disparamos el evento global para que el
      // modal de SessionExpiredModal aparezca igual que con apiFetch.
      if (xhr.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("portal:session-expired"));
      }
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, id: data.id, fileName: data.fileName });
        } else {
          resolve({ ok: false, error: data.error || "Error al subir el archivo" });
        }
      } catch {
        resolve({ ok: false, error: "Respuesta inválida del servidor" });
      }
    };

    xhr.onerror = () => resolve({ ok: false, error: "Error de red" });
    xhr.ontimeout = () => resolve({ ok: false, error: "Tiempo de espera agotado" });
    xhr.timeout = 60_000;

    xhr.send(formData);
  });
}
