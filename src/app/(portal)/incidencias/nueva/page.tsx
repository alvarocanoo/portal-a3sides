"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUploader, type PendingFile } from "@/components/incidents/file-uploader";
import { uploadAttachment } from "@/lib/upload";
import { apiFetch } from "@/lib/api-fetch";

const STATIC_CATEGORIES = [
  "a3FacturaGo",
  "a3INNUVA Contabilidad",
  "a3INNUVA Facturación",
  "a3INNUVA Connectia",
  "INNUVA ERP",
  "Otro",
];

type ProductsState =
  | { kind: "loading" }
  | { kind: "irecursos"; options: string[] }
  | { kind: "fallback"; options: string[]; reason: string };

const FALLBACK_MESSAGES: Record<string, string | null> = {
  "no-company": null,
  "no-irecursos-link": null,
  "no-contracts":
    "No se encontraron contratos activos para tu empresa. Selecciona el producto manualmente.",
  "irecursos-error":
    "No se pudieron cargar tus productos contratados. Selecciona el producto manualmente.",
};

export default function NuevaIncidenciaPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductsState>({ kind: "loading" });
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/irecursos/client-products")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.source === "irecursos" && Array.isArray(data.contracts)) {
          const options = data.contracts.map(
            (c: { description: string }) => c.description
          );
          setProducts({ kind: "irecursos", options });
        } else {
          setProducts({
            kind: "fallback",
            options: STATIC_CATEGORIES,
            reason: data.reason || "irecursos-error",
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProducts({
          kind: "fallback",
          options: STATIC_CATEGORIES,
          reason: "irecursos-error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // No permitir submit si hay archivos con error de validacion en cliente
    if (attachments.some((a) => a.error)) {
      setError("Quita los archivos marcados en rojo antes de continuar");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, category }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear la incidencia");
        return;
      }

      const incident = await res.json();

      // Subir adjuntos asociados a la nueva incidencia
      const warnings: string[] = [];
      for (let i = 0; i < attachments.length; i++) {
        setUploadingIdx(i);
        setUploadProgress(0);
        const result = await uploadAttachment({
          file: attachments[i].file,
          incidentId: incident.id,
          onProgress: (p) => setUploadProgress(p.percent),
        });
        if (!result.ok) {
          warnings.push(`${attachments[i].file.name}: ${result.error}`);
        }
      }
      setUploadingIdx(null);

      // La incidencia se ha creado siempre; si hubo fallos en adjuntos,
      // los pasamos como query param para mostrar el aviso en el detalle.
      if (warnings.length > 0) {
        sessionStorage.setItem(
          `upload-warnings-${incident.id}`,
          JSON.stringify(warnings)
        );
      }
      router.push(`/incidencias/${incident.id}`);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
      setUploadingIdx(null);
    }
  }

  const fallbackMsg =
    products.kind === "fallback" ? FALLBACK_MESSAGES[products.reason] : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Nueva incidencia
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border border-gray-200 p-6 space-y-5"
      >
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="subject"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Asunto *
          </label>
          <input
            id="subject"
            type="text"
            required
            minLength={5}
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            placeholder="Resumen breve del problema"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Descripción *
          </label>
          <textarea
            id="description"
            required
            minLength={10}
            maxLength={10000}
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            placeholder="Describe el problema con el mayor detalle posible: qué estabas haciendo, qué error aparece, pasos para reproducirlo..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700"
            >
              Producto
            </label>
            {products.kind === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#275d6b]" />
                Cargando…
              </span>
            )}
          </div>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={products.kind === "loading"}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] disabled:opacity-60 disabled:cursor-wait"
          >
            <option value="">Seleccionar…</option>
            {products.kind !== "loading" &&
              products.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
          </select>
          {fallbackMsg && (
            <p className="mt-1.5 text-xs text-gray-500">{fallbackMsg}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Adjuntos
            <span className="ml-1 text-gray-400 font-normal">(opcional)</span>
          </label>
          <FileUploader
            files={attachments}
            onFilesChange={setAttachments}
            disabled={loading}
          />
        </div>

        {uploadingIdx !== null && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span className="truncate pr-2">
                Subiendo {uploadingIdx + 1}/{attachments.length}:{" "}
                {attachments[uploadingIdx]?.file.name}
              </span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#275d6b] transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={
              loading ||
              products.kind === "loading" ||
              attachments.some((a) => a.error)
            }
            className="px-5 py-2.5 bg-[#275d6b] text-white font-medium rounded-md hover:bg-[#1f4e5b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? uploadingIdx !== null
                ? "Subiendo archivos..."
                : "Creando..."
              : "Crear incidencia"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 text-gray-600 font-medium rounded-md border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
