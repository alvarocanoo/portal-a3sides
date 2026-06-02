"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Formulario de creación de empresa — modo manual directo.
 *
 * El antiguo modo "Importar de iRecursos" (búsqueda individual + import
 * uno-a-uno con SyncService) se eliminó: el enfoque definitivo es la
 * importación MASIVA (`/api/admin/bulk-import/irecursos`), que se lanza
 * por separado desde un script ADMIN. La creación manual aquí cubre los
 * casos puntuales: una empresa nueva, edición rápida, o llenar el
 * `irecursosClientId` a mano si fuera necesario.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [irecursosClientId, setIrecursosClientId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          taxId: taxId || undefined,
          irecursosClientId: irecursosClientId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear la empresa");
        return;
      }

      handleClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setTaxId("");
    setIrecursosClientId("");
    setError("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-4 py-2 bg-[#275d6b] text-white text-sm font-medium rounded-md hover:bg-[#1f4e5b] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nueva empresa
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Nueva empresa</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CIF/NIF
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID en iRecursos
              </label>
              <input
                type="text"
                value={irecursosClientId}
                onChange={(e) => setIrecursosClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
                placeholder="Opcional"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b] disabled:opacity-50"
              >
                {loading ? "Creando..." : "Crear empresa"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
