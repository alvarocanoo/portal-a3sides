"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Role } from "@prisma/client";
import {
  CLIENT_STATUS_OPTIONS,
  STAFF_STATUS_OPTIONS,
} from "@/lib/incident-states";
import { PRIORITY_OPTIONS } from "@/lib/constants";

interface Props {
  role: Role;
  currentStatus?: string;
  currentPriority?: string;
  currentSearch?: string;
  // Filtro "Asignadas a mí" — solo STAFF lo ve y lo emite. Se serializa
  // únicamente cuando vale "me"; cualquier otro valor en URL se ignora.
  currentAssigned?: string;
}

const SEARCH_DEBOUNCE_MS = 400;

export function IncidentFilters({
  role,
  currentStatus,
  currentPriority,
  currentSearch,
  currentAssigned,
}: Props) {
  // Tanto CLIENT como AGENT/ADMIN tienen ahora "Activas" como default y
  // una opción "Todas (incluye cerradas)" — única diferencia: CLIENT ve
  // 4 etiquetas agrupadas, STAFF ve los 6 estados reales.
  const isClient = role === "CLIENT";
  const statusOptions = isClient ? CLIENT_STATUS_OPTIONS : STAFF_STATUS_OPTIONS;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado LOCAL del input: refleja al instante lo que teclea el usuario.
  // La URL se actualiza tras debounce (400 ms) o al pulsar Enter.
  const [search, setSearch] = useState(currentSearch || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildUrl(overrides: {
    status?: string;
    priority?: string;
    search?: string;
    assigned?: string;
  }): string {
    const params = new URLSearchParams();

    const status =
      overrides.status !== undefined ? overrides.status : currentStatus || "";
    // CLIENT no usa priority bajo ningún concepto: ni propagado desde la
    // URL ni emitido por este componente.
    const priority = isClient
      ? ""
      : overrides.priority !== undefined
        ? overrides.priority
        : currentPriority || "";
    const searchVal =
      overrides.search !== undefined ? overrides.search : currentSearch || "";
    // Mismo blindaje que priority: CLIENT lo fuerza a "" para que ni
    // siquiera reaparezca si el usuario lo metió a mano en la URL. STAFF
    // acepta el override; sin él, hereda el currentAssigned.
    const assigned = isClient
      ? ""
      : overrides.assigned !== undefined
        ? overrides.assigned
        : currentAssigned || "";

    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (searchVal) params.set("search", searchVal);
    // Solo serializamos el valor canónico "me". Cualquier otro string
    // (basura, vacío, foo) no se propaga — evita que valores inválidos
    // de URL "se peguen" al navegar entre filtros.
    if (assigned === "me") params.set("assigned", "me");

    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  // ── Navegación directa con router.push ────────────────────────────────
  // SIN useTransition. La iteración anterior (envolver con
  // startTransition + atenuación) provocaba cuelgues intermitentes del
  // isPending al filtrar por valores reales del enum (status=OPEN,
  // WAITING_CLIENT). Diagnóstico HTTP confirmó que el server respondía
  // 200 en ~400 ms, así que el cuelgue era client-side de useTransition.
  // Revertido a router.push directo: lento pero 100% fiable.
  function navigate(url: string) {
    router.push(url);
  }

  function fireSearch(value: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    navigate(buildUrl({ search: value }));
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate(buildUrl({ search: value }));
      debounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter dispara inmediato (cancela el debounce). UX clásica para
    // usuarios que prefieran pulsar Enter después de teclear.
    if (e.key === "Enter") {
      e.preventDefault();
      fireSearch(search);
    }
  }

  function clearFilters() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearch("");
    // pathname pelado → Activas + sin búsqueda + sin priority colada.
    // router.refresh para forzar al server a re-renderizar aunque Next.js
    // considere que el URL "no cambió".
    router.push(pathname);
    router.refresh();
  }

  // Sincronizar input local con `currentSearch` cuando el server lo
  // cambia (caso "Limpiar" o navegación externa).
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearch(currentSearch || "");
  }, [currentSearch]);

  // Cleanup al desmontar: nunca dejar timeouts huérfanos.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Mostrar "Limpiar" si HAY CUALQUIER param en la URL (incluido `?page=`
  // o `?priority=` colado en CLIENT) O si el input tiene texto pendiente.
  const hasFilters = searchParams.size > 0 || !!search;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar por referencia, asunto..."
              aria-label="Buscar incidencias"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
            />
          </div>
        </div>

        <select
          value={currentStatus || ""}
          onChange={(e) => navigate(buildUrl({ status: e.target.value }))}
          aria-label="Filtrar por estado"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Filtro de prioridad: oculto para CLIENT */}
        {!isClient && (
          <select
            value={currentPriority || ""}
            onChange={(e) => navigate(buildUrl({ priority: e.target.value }))}
            aria-label="Filtrar por prioridad"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}

        {/* Toggle "Asignadas a mí": dos botones segmentados, solo STAFF.
            Activo = fondo teal + texto blanco (mismo patrón que la
            paginación activa en la lista). Inactivo = borde gris. */}
        {!isClient && (
          <div
            role="group"
            aria-label="Filtrar por asignación"
            className="inline-flex rounded-md border border-gray-300 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => navigate(buildUrl({ assigned: "" }))}
              aria-pressed={currentAssigned !== "me"}
              className={
                currentAssigned !== "me"
                  ? "px-3 py-2 text-sm bg-[#275d6b] text-white"
                  : "px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              }
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => navigate(buildUrl({ assigned: "me" }))}
              aria-pressed={currentAssigned === "me"}
              className={
                currentAssigned === "me"
                  ? "px-3 py-2 text-sm bg-[#275d6b] text-white border-l border-[#275d6b]"
                  : "px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-l border-gray-300"
              }
            >
              Asignadas a mí
            </button>
          </div>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 transition-shadow"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
