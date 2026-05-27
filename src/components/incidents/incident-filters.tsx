"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

interface Props {
  currentStatus?: string;
  currentPriority?: string;
  currentSearch?: string;
}

const STATUSES = [
  { value: "", label: "Todos" },
  { value: "OPEN", label: "Abiertas" },
  { value: "IN_PROGRESS", label: "En curso" },
  { value: "WAITING_CLIENT", label: "Esp. cliente" },
  { value: "WAITING_THIRD_PARTY", label: "Esp. tercero" },
  { value: "RESOLVED", label: "Resueltas" },
  { value: "CLOSED", label: "Cerradas" },
];

const PRIORITIES = [
  { value: "", label: "Todas" },
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "CRITICAL", label: "Crítica" },
];

export function IncidentFilters({
  currentStatus,
  currentPriority,
  currentSearch,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(currentSearch || "");

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams();

    const status = key === "status" ? value : (currentStatus || "");
    const priority = key === "priority" ? value : (currentPriority || "");
    const searchVal = key === "search" ? value : (currentSearch || "");

    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (searchVal) params.set("search", searchVal);

    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParams("search", search);
  }

  function clearFilters() {
    setSearch("");
    router.push(pathname);
  }

  const hasFilters = currentStatus || currentPriority || currentSearch;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por referencia, asunto..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </form>

        <select
          value={currentStatus || ""}
          onChange={(e) => updateParams("status", e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={currentPriority || ""}
          onChange={(e) => updateParams("priority", e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
