import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/api";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import {
  ACTION_LABELS,
  formatEntity,
  formatDetails,
  type EnrichedAuditItem,
} from "@/lib/audit-format";
import { formatDateTime } from "@/lib/constants";

// Hardcap interno: lo redefinimos aquí para incluirlo en la metadata del
// audit log de exportación (el servicio acepta override pero usamos su
// default). Mantenerlo sincronizado con el default de listForExport.
const HARD_CAP = 10_000;

// Escapado CSV RFC 4180:
//   - Si el campo contiene `"`, `,`, `\r` o `\n`, se envuelve en comillas
//     dobles y las comillas internas se duplican.
//   - undefined/null → string vacío.
function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /["\n\r,]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// Construye una línea CSV a partir de un array de campos. Usa CRLF (RFC).
function csvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(csvEscape).join(",") + "\r\n";
}

// "audit-export-20260603-1234.csv". Sin ':' ni '/' (no son válidos en
// filenames Windows y rompen Content-Disposition en algunos clientes).
function exportFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `audit-export-${ts}.csv`;
}

export async function GET(request: Request) {
  try {
    // Migrado a authorizeApi (segunda auditoría §2.1): este endpoint
    // quedó fuera del refactor §3.6 original porque no estaba en la
    // lista de los 12 mutadores. Pero ES una mutación de hecho (registra
    // audit.export en AuditLog) y debe llevar el mismo guard
    // mustChangePassword que el resto, por coherencia y porque un admin
    // que aún no ha cambiado su pw temporal no debería poder exportar
    // el audit completo (contiene datos personales de todos los usuarios).
    const authz = await authorizeApi({ roles: ["ADMIN"] });
    if (!authz.ok) return authz.response;
    const { session } = authz;

    // ── Parseo de filtros (mismo contrato que la página) ──────────────
    const url = new URL(request.url);
    const sp = url.searchParams;

    const action = sp.get("action") || undefined;
    const userSearch = sp.get("userSearch")?.trim() || undefined;
    const dateFromISO = sp.get("dateFrom") || "";
    const dateToISO = sp.get("dateTo") || "";

    const parsedFrom = dateFromISO ? new Date(`${dateFromISO}T00:00:00`) : null;
    const parsedTo = dateToISO ? new Date(`${dateToISO}T00:00:00`) : null;
    const dateFrom =
      parsedFrom && isFinite(parsedFrom.getTime()) ? parsedFrom : undefined;
    const dateToExclusive =
      parsedTo && isFinite(parsedTo.getTime())
        ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000)
        : undefined;

    // ── Query con hardcap ─────────────────────────────────────────────
    const { items, total, truncated } = await AuditService.listForExport(
      { action, dateFrom, dateTo: dateToExclusive, userSearch },
      HARD_CAP
    );

    // ── Generación del CSV ────────────────────────────────────────────
    // Columnas decididas: Fecha, Usuario, Email, Acción, Entidad,
    // Detalles, IP, User-Agent. Mismo orden que las cabeceras.
    const HEADERS = [
      "Fecha",
      "Usuario",
      "Email",
      "Acción",
      "Entidad",
      "Detalles",
      "IP",
      "User-Agent",
    ];

    let body = "";
    // BOM UTF-8 (﻿) — Excel lo necesita para detectar el encoding y
    // mostrar bien acentos y ñ. Otros parsers CSV serios lo ignoran por
    // defecto. Lo escribimos con la secuencia escapada explícita en lugar
    // de un carácter literal para evitar que herramientas de edición o
    // codificación intermedia lo eliminen sin querer.
    body += "﻿";
    body += csvRow(HEADERS);

    for (const item of items as EnrichedAuditItem[]) {
      const userName = item.user
        ? `${item.user.firstName} ${item.user.lastName}`
        : "Sistema";
      body += csvRow([
        formatDateTime(item.createdAt),
        userName,
        item.user?.email ?? "",
        ACTION_LABELS[item.action] ?? item.action,
        formatEntity(item),
        formatDetails(item),
        item.ipAddress ?? "",
        item.userAgent ?? "",
      ]);
    }

    if (truncated) {
      // Fila marcadora — primera celda en MAYÚSCULAS para que sea imposible
      // pasar por alto. Las otras 7 celdas quedan vacías.
      body += csvRow([
        `(TRUNCADO: solo se exportan las primeras ${HARD_CAP} filas. Refina los filtros para ver el resto.)`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }

    // ── Autoaudit del export ──────────────────────────────────────────
    // Quién exportó, cuántas filas, con qué filtros. Razón: una copia del
    // audit log es información sensible y debemos rastrear quién se la
    // llevó. Se ejecuta DESPUÉS de generar el body para no fallar si la
    // generación fallara.
    const { ipAddress, userAgent } = getRequestContext(request);
    await AuditService.log({
      action: "audit.export",
      userId: session.user.id,
      // Sin entityType/entityId: el export no apunta a una entidad
      // concreta, es una acción sobre el propio audit log.
      metadata: {
        rows: total,
        truncated,
        filters: {
          action: action ?? null,
          dateFrom: dateFromISO || null,
          dateTo: dateToISO || null,
          userSearch: userSearch ?? null,
        },
      },
      ipAddress,
      userAgent,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
