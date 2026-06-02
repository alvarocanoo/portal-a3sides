/**
 * Parser puro del HTML de la tabla `modal_clients` de iRecursos.
 *
 * Recibe el HTML que viene dentro del <cmd id="MODAL_CLIENTS_TAULA"> de la
 * respuesta XJX y devuelve los clientes estructurados. NO hace red ni BD.
 * Aislado en su propio módulo para que sea testeable contra fixtures sin
 * tocar iRecursos.
 *
 * Forma esperada de cada fila (validada contra muestra real):
 *   <tr ...><td><strong>CODCLI</strong></td>
 *           <td><strong>NOMBRE</strong></td>
 *           <td><strong>ORGANIZACIÓN</strong></td>
 *           <td><strong>NIF</strong></td>
 *           <td><strong>TELÉFONO</strong></td>
 *           <td><strong>EMAIL[;EMAIL...]</strong></td>
 *           <td><strong>F | otro</strong></td></tr>
 *
 * El codcli viene con padding por la izquierda ("       7") — se hace trim.
 * Si email contiene varios separados por ; , o espacio, se queda el primero
 * que pase un regex básico de validación. Si ninguno es válido → null.
 */

export interface ParsedClient {
  codcli: string;
  name: string;
  organization: string;
  nif: string;
  phone: string;
  email: string | null;
  blocked: boolean;
}

export interface ParseError {
  rowIndex: number;
  reason: string;
  snippet: string;
}

export interface ParseResult {
  clients: ParsedClient[];
  totalPages: number | null;
  errors: ParseError[];
}

const TBODY_RE = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const STRONG_RE = /<strong\b[^>]*>([\s\S]*?)<\/strong>/i;
const TOTAL_PAGES_RE = /P[áa]g\.\s*\d+\s*de\s*(\d+)/i;
const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/gi, (m) => (m[1] === "A" ? "Á" : "á"))
    .replace(/&eacute;/gi, (m) => (m[1] === "E" ? "É" : "é"))
    .replace(/&iacute;/gi, (m) => (m[1] === "I" ? "Í" : "í"))
    .replace(/&oacute;/gi, (m) => (m[1] === "O" ? "Ó" : "ó"))
    .replace(/&uacute;/gi, (m) => (m[1] === "U" ? "Ú" : "ú"))
    .replace(/&ntilde;/gi, (m) => (m[1] === "N" ? "Ñ" : "ñ"))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function cleanCellValue(rawCell: string): string {
  // El contenido suele venir envuelto en <strong>VALOR</strong>. Si por
  // cualquier razón no estuviera, caemos al texto plano de la celda.
  const strongMatch = rawCell.match(STRONG_RE);
  const inner = strongMatch ? strongMatch[1] : rawCell;
  return decodeEntities(stripTags(inner)).trim();
}

export function extractFirstEmail(raw: string): string | null {
  if (!raw) return null;
  const parts = raw
    .split(/[;,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (EMAIL_RE.test(p)) return p.toLowerCase();
  }
  return null;
}

export function parseModalClientsTable(html: string): ParseResult {
  const errors: ParseError[] = [];

  // totalPages del footer "Pág. X de Y". Si no aparece, devolvemos null —
  // el orquestador decide qué hacer (probablemente parar tras esa página).
  const totalMatch = html.match(TOTAL_PAGES_RE);
  const totalPages = totalMatch ? parseInt(totalMatch[1], 10) : null;

  const tbodyMatch = html.match(TBODY_RE);
  if (!tbodyMatch) {
    errors.push({
      rowIndex: -1,
      reason: "tbody no encontrado",
      snippet: html.slice(0, 200),
    });
    return { clients: [], totalPages, errors };
  }

  const tbody = tbodyMatch[1];
  const clients: ParsedClient[] = [];

  let rowMatch: RegExpExecArray | null;
  let rowIndex = -1;
  const rowRegex = new RegExp(ROW_RE.source, ROW_RE.flags);

  while ((rowMatch = rowRegex.exec(tbody)) !== null) {
    rowIndex++;
    const rowContent = rowMatch[1];

    const cells: string[] = [];
    const cellRegex = new RegExp(CELL_RE.source, CELL_RE.flags);
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cleanCellValue(cellMatch[1]));
    }

    if (cells.length !== 7) {
      errors.push({
        rowIndex,
        reason: `Se esperaban 7 celdas, se encontraron ${cells.length}`,
        snippet: rowContent.slice(0, 200),
      });
      continue;
    }

    const [codcliRaw, name, organization, nif, phone, emailRaw, blockedRaw] =
      cells;
    const codcli = codcliRaw.trim();

    if (!codcli) {
      errors.push({
        rowIndex,
        reason: "codcli vacío",
        snippet: rowContent.slice(0, 200),
      });
      continue;
    }

    clients.push({
      codcli,
      name,
      organization,
      nif,
      phone,
      email: extractFirstEmail(emailRaw),
      // "F" = no bloqueado. Cualquier otro valor (incluido vacío) lo
      // consideramos bloqueado por seguridad: ante duda, no se importa el
      // usuario. El usuario nos confirmará la convención cuando tengamos
      // una fila bloqueada de muestra.
      blocked: blockedRaw.trim().toUpperCase() !== "F",
    });
  }

  return { clients, totalPages, errors };
}
