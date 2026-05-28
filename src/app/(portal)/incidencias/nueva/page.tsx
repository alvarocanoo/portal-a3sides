"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PRIORITY_OPTIONS } from "@/lib/constants";

const STATIC_CATEGORIES = [
  "a3FacturaGo",
  "a3INNUVA Contabilidad",
  "a3INNUVA Facturación",
  "a3INNUVA Connectia",
  "INNUVA ERP",
  "Otro",
];

const PRIORITIES = PRIORITY_OPTIONS.filter((p) => p.value !== "");

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
  const [priority, setPriority] = useState("MEDIUM");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductsState>({ kind: "loading" });

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
    setLoading(true);

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, priority, category }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear la incidencia");
        return;
      }

      const incident = await res.json();
      router.push(`/incidencias/${incident.id}`);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
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

        <div className="grid grid-cols-2 gap-4">
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
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Prioridad
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || products.kind === "loading"}
            className="px-5 py-2.5 bg-[#275d6b] text-white font-medium rounded-md hover:bg-[#1f4e5b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creando..." : "Crear incidencia"}
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
