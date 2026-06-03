import Link from "next/link";
import { requireRole } from "@/lib/auth/helpers";
import { AuditService } from "@/services/audit.service";
import { formatDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  formatEntity,
  formatDetails,
} from "@/lib/audit-format";

// Opciones del desplegable de filtro. Orden = orden de ACTION_LABELS, que
// agrupa por entidad (incidents → users → companies). Si en el futuro se
// añade una acción nueva, basta con añadirla a ACTION_LABELS y aparecerá
// aquí automáticamente.
const ACTION_FILTER_OPTIONS = Object.entries(ACTION_LABELS).map(
  ([value, label]) => ({ value, label })
);

// Resumen corto del user-agent para la columna "Origen".
// Pensado para identificar de un vistazo cliente común sin librería. El UA
// completo SIEMPRE queda accesible en el tooltip `title` de la celda, así
// que aquí basta con cubrir los casos habituales y devolver null si no se
// reconoce — la UI muestra "Cliente desconocido" en ese caso.
//
// Orden de checks importa: Edge envía "Chrome/" en su UA, así que hay que
// detectarlo ANTES que Chrome. Chrome a su vez envía "Safari/", igual.
function summarizeUserAgent(ua: string | null): string | null {
  if (!ua) return null;

  let browser: string | null = null;
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";

  let os: string | null = null;
  // iPhone/iPad antes que Mac (iPadOS 13+ envía UA tipo macOS, no hay
  // manera fiable de distinguir desde el UA, lo aceptamos).
  if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  if (browser && os) return `${browser} / ${os}`;
  return browser || os;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  // ── Parsing de filtros desde searchParams ──────────────────────────
  // Strings vacíos → undefined (sin filtro). Fechas con input type="date"
  // llegan siempre en formato YYYY-MM-DD; las normalizamos a Date local:
  //   dateFrom → 00:00 del día (>= en la query).
  //   dateTo   → 00:00 del día SIGUIENTE (< en la query), de forma que
  //              "hasta 2026-06-03" incluye TODO el día 3.
  // Defensivo: si el input está manipulado y queda Invalid Date, lo
  // ignoramos en lugar de romper la query.
  const action = params.action || undefined;
  const userSearch = params.userSearch?.trim() || undefined;

  const dateFromISO = params.dateFrom || "";
  const dateToISO = params.dateTo || "";
  const parsedFrom = dateFromISO ? new Date(`${dateFromISO}T00:00:00`) : null;
  const parsedTo = dateToISO ? new Date(`${dateToISO}T00:00:00`) : null;
  const dateFrom =
    parsedFrom && isFinite(parsedFrom.getTime()) ? parsedFrom : undefined;
  const dateToExclusive =
    parsedTo && isFinite(parsedTo.getTime())
      ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000)
      : undefined;

  const hasAnyFilter = Boolean(action || dateFromISO || dateToISO || userSearch);

  const result = await AuditService.list(page, 30, {
    action,
    dateFrom,
    dateTo: dateToExclusive,
    userSearch,
  });

  // Querystring SIN page para reutilizar entre paginación y export.
  function filterQs(): URLSearchParams {
    const qs = new URLSearchParams();
    if (action) qs.set("action", action);
    if (dateFromISO) qs.set("dateFrom", dateFromISO);
    if (dateToISO) qs.set("dateTo", dateToISO);
    if (userSearch) qs.set("userSearch", userSearch);
    return qs;
  }

  // Helper para construir el href de cada link de paginación preservando
  // los filtros activos. Encapsulado para evitar concatenación a mano.
  function pageHref(p: number): string {
    const qs = filterQs();
    qs.set("page", String(p));
    return `/admin/audit?${qs.toString()}`;
  }

  // Href del endpoint de exportación CSV con los filtros actuales. Sin
  // filtros, exporta todo (con el hardcap del servicio). El navegador
  // dispara la descarga porque la respuesta lleva Content-Disposition.
  const exportQsStr = filterQs().toString();
  const exportHref = `/api/admin/audit/export${exportQsStr ? `?${exportQsStr}` : ""}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Registro de actividad
      </h1>

      {/* Form GET nativo: el navegador serializa los inputs y navega a
          /admin/audit con los params en la URL. Cero JS, cero useState,
          cero useEffect → cero riesgo de bucle. Re-renderiza server-side. */}
      <form
        method="GET"
        action="/admin/audit"
        className="bg-white rounded-lg border border-gray-200 p-4 mb-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="filter-action"
              className="block text-xs text-gray-500 mb-1"
            >
              Acción
            </label>
            <select
              id="filter-action"
              name="action"
              defaultValue={action || ""}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            >
              <option value="">Todas</option>
              {ACTION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-dateFrom"
              className="block text-xs text-gray-500 mb-1"
            >
              Desde
            </label>
            <input
              id="filter-dateFrom"
              type="date"
              name="dateFrom"
              defaultValue={dateFromISO}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            />
          </div>

          <div>
            <label
              htmlFor="filter-dateTo"
              className="block text-xs text-gray-500 mb-1"
            >
              Hasta
            </label>
            <input
              id="filter-dateTo"
              type="date"
              name="dateTo"
              defaultValue={dateToISO}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="filter-userSearch"
              className="block text-xs text-gray-500 mb-1"
            >
              Usuario
            </label>
            <input
              id="filter-userSearch"
              type="text"
              name="userSearch"
              defaultValue={userSearch || ""}
              placeholder="Nombre o email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b]"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[#275d6b] text-white text-sm font-medium rounded-md hover:bg-[#1f4e5b] transition-colors"
          >
            Filtrar
          </button>

          {hasAnyFilter && (
            <Link
              href="/admin/audit"
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Limpiar
            </Link>
          )}

          {/* Exportar CSV: <a> nativo, no Link de Next — necesitamos que el
              navegador haga una navegación normal HTTP para que dispare
              "guardar como" con el Content-Disposition. Link de Next haría
              client-side navigation que NO triggerea descargas. */}
          <a
            href={exportHref}
            className="px-3 py-2 text-sm text-[#275d6b] hover:text-[#1f4e5b] border border-[#275d6b]/30 rounded-md hover:bg-[#275d6b]/5"
            title={
              hasAnyFilter
                ? "Descargar CSV con los filtros activos"
                : "Descargar CSV de todo el registro"
            }
          >
            Exportar CSV
          </a>
        </div>
      </form>

      <p className="text-sm text-gray-500 mb-3">
        {result.total} registro{result.total !== 1 && "s"}
        {hasAnyFilter && " encontrados con los filtros activos"}
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {hasAnyFilter
              ? "No hay registros que coincidan con los filtros."
              : "No hay registros de actividad."}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acción
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Origen
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entidad
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.items.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "Sistema"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap"
                    // El UA completo va en title para inspección manual al
                    // hacer hover. Si no hay UA, sin tooltip.
                    title={log.userAgent ?? undefined}
                  >
                    {log.ipAddress ?? "—"}
                    {log.userAgent && (
                      <div className="text-xs text-gray-400">
                        {summarizeUserAgent(log.userAgent) ?? "Cliente desconocido"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatEntity(log)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDetails(log)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {result.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-1">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <Link
                key={p}
                href={pageHref(p)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  p === result.page
                    ? "bg-[#275d6b] text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {p}
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}
