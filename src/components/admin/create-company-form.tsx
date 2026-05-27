"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search, Download } from "lucide-react";

interface IRecursosClient {
  codcli: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
}

export function CreateCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "irecursos">("manual");

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [irecursosClientId, setIrecursosClientId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IRecursosClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearchIRecursos() {
    if (searchQuery.length < 2) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);

    try {
      const res = await fetch(
        `/api/irecursos/search-client?q=${encodeURIComponent(searchQuery)}`
      );
      if (!res.ok) {
        const data = await res.json();
        setSearchError(data.error || "Error al buscar");
        return;
      }
      const data = await res.json();
      setSearchResults(data);
      if (data.length === 0) setSearchError("No se encontraron resultados");
    } catch {
      setSearchError("Error de conexión con iRecursos");
    } finally {
      setSearching(false);
    }
  }

  async function handleImportClient(client: IRecursosClient) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/irecursos/import-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: client.codcli }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al importar");
        return;
      }

      handleClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/companies", {
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
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setError("");
    setMode("manual");
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
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 py-2.5 text-sm font-medium text-center ${
              mode === "manual"
                ? "text-[#275d6b] border-b-2 border-[#275d6b]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Crear manual
          </button>
          <button
            onClick={() => setMode("irecursos")}
            className={`flex-1 py-2.5 text-sm font-medium text-center ${
              mode === "irecursos"
                ? "text-[#275d6b] border-b-2 border-[#275d6b]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Download className="h-4 w-4 inline mr-1" />
            Importar de iRecursos
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3 mb-4">
              {error}
            </div>
          )}

          {mode === "irecursos" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchIRecursos()}
                  placeholder="Buscar por nombre o código de cliente..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
                />
                <button
                  onClick={handleSearchIRecursos}
                  disabled={searching || searchQuery.length < 2}
                  className="px-4 py-2 bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b] disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              {searchError && (
                <p className="text-sm text-gray-500">{searchError}</p>
              )}

              {searching && (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#275d6b]" />
                  <span className="ml-2 text-sm text-gray-500">
                    Buscando en iRecursos...
                  </span>
                </div>
              )}

              {searchResults.map((client) => (
                <div
                  key={client.codcli}
                  className="border border-gray-200 rounded-md p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{client.name}</p>
                      <p className="text-sm text-gray-500">
                        Código: {client.codcli.trim()}
                        {client.nif && ` — NIF: ${client.nif}`}
                      </p>
                      {client.email && (
                        <p className="text-sm text-gray-500">{client.email}</p>
                      )}
                      {client.phone && (
                        <p className="text-sm text-gray-500">
                          Tel: {client.phone}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleImportClient(client)}
                      disabled={loading}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {loading ? "..." : "Importar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
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
          )}
        </div>
      </div>
    </div>
  );
}
