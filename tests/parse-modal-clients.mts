/**
 * Tests del parser de modal_clients (puro, sin red ni BD).
 *
 * Ejecutar: npx tsx tests/parse-modal-clients.mts
 *
 * IMPORTANTE: este fixture es SINTÉTICO. La estructura HTML es idéntica a
 * la respuesta real de iRecursos (verificada contra muestra), pero todos
 * los datos (códigos, NIFs, nombres, emails, teléfonos) son inventados.
 * Los datos reales NUNCA se comitean al repo.
 */

import {
  parseModalClientsTable,
  extractFirstEmail,
  type ParsedClient,
} from "../src/lib/irecursos/parse-modal-clients.ts";
import {
  selectModalClientsHtml,
  buildModalClientsXjxObj,
  MODAL_CLIENTS_FORM_FIELD_COUNT,
} from "../src/lib/irecursos/client.ts";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(name, ok, ok ? undefined : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

// ── Fixture sintético con la misma estructura que la respuesta real ───
// Mismas características que la página 1 real:
//   - <strong> envolviendo cada valor
//   - codcli con padding por la izquierda
//   - blocked = "F" para no-bloqueado
//   - footer "Pág. X de N"
// Además añadimos casos que no aparecían en la página 1 para cubrir:
//   - cliente bloqueado (blocked != "F")
//   - acentos literales y entities &aacute;
//   - email múltiple separado por ";"
//   - fila malformada (5 td)
//   - codcli "0" con campos vacíos (placeholder de sistema)
const SYNTHETIC_HTML = `
<table class="table table-normal table-hover">
<thead>
<tr>
  <td><strong>Cód. cliente</strong></td>
  <td><strong>Nombre comercial de la organización</strong></td>
  <td><strong>Organización</strong></td>
  <td><strong>NIF</strong></td>
  <td><strong>Teléfono</strong></td>
  <td><strong>E-Mail</strong></td>
  <td><strong>Bloqueado</strong></td>
</tr>
</thead>
<tbody>
  <tr onclick="x">
    <td><strong>       0</strong></td>
    <td><strong>PLACEHOLDER GENERICO</strong></td>
    <td><strong>PLACEHOLDER GENERICO</strong></td>
    <td><strong></strong></td>
    <td><strong></strong></td>
    <td><strong></strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       1</strong></td>
    <td><strong>EMPRESA ALFA SL</strong></td>
    <td><strong>EMPRESA ALFA SL</strong></td>
    <td><strong>B11111111</strong></td>
    <td><strong>911111111</strong></td>
    <td><strong>alfa@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       2</strong></td>
    <td><strong>EMPRESA MULTIMAIL SL</strong></td>
    <td><strong>EMPRESA MULTIMAIL SL</strong></td>
    <td><strong>B22222222</strong></td>
    <td><strong>922222222</strong></td>
    <td><strong>uno@ejemplo.test;dos@ejemplo.test;tres@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       3</strong></td>
    <td><strong>EMPRESA BLOQUEADA SL</strong></td>
    <td><strong>EMPRESA BLOQUEADA SL</strong></td>
    <td><strong>B33333333</strong></td>
    <td><strong>933333333</strong></td>
    <td><strong>bloqueada@ejemplo.test</strong></td>
    <td><strong>T</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       4</strong></td>
    <td><strong>ÑOÑO ACENTÚAS SL</strong></td>
    <td><strong>ÑOÑO ACENTÚAS SL</strong></td>
    <td><strong>B44444444</strong></td>
    <td><strong>944444444</strong></td>
    <td><strong>nono@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       5</strong></td>
    <td><strong>EMPRESA &aacute;CIDA SL</strong></td>
    <td><strong>EMPRESA &aacute;CIDA SL</strong></td>
    <td><strong>B55555555</strong></td>
    <td><strong>955555555</strong></td>
    <td><strong>acida@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       6</strong></td>
    <td><strong>SIN NIF SL</strong></td>
    <td><strong>SIN NIF SL</strong></td>
    <td><strong></strong></td>
    <td><strong>966666666</strong></td>
    <td><strong>sin-nif@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       7</strong></td>
    <td><strong>EMAIL MALFORMADO SL</strong></td>
    <td><strong>EMAIL MALFORMADO SL</strong></td>
    <td><strong>B77777777</strong></td>
    <td><strong>977777777</strong></td>
    <td><strong>no-es-email</strong></td>
    <td><strong>F</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       8</strong></td>
    <td><strong>FILA MALFORMADA</strong></td>
    <td><strong>SOLO 5 CELDAS</strong></td>
    <td><strong>B88888888</strong></td>
    <td><strong>988888888</strong></td>
  </tr>
  <tr onclick="x">
    <td><strong>       9</strong></td>
    <td><strong>ÚLTIMA NORMAL SL</strong></td>
    <td><strong>ÚLTIMA NORMAL SL</strong></td>
    <td><strong>B99999999</strong></td>
    <td><strong>999999999</strong></td>
    <td><strong>ultima@ejemplo.test</strong></td>
    <td><strong>F</strong></td>
  </tr>
</tbody>
<tfoot>
<tr class="table-footer">
<td colspan="7">
  <div class="pull-right"><span class="text-info">Pág. 1 de 447</span></div>
</td></tr>
</tfoot>
</table>
`;

console.log("=== Parser unit tests ===\n");

const result = parseModalClientsTable(SYNTHETIC_HTML);

// ── totalPages ──────────────────────────────────────────────────────
eq("totalPages extraído del footer", result.totalPages, 447);

// ── conteo de clientes válidos (9 — la fila malformada se descarta) ─
eq("9 clientes válidos (10 - 1 malformada)", result.clients.length, 9);

// ── conteo de errores de parsing (la fila malformada) ───────────────
eq("1 error de parsing reportado", result.errors.length, 1);
assert(
  "el error reporta 5 celdas en vez de 7",
  result.errors[0]?.reason.includes("5")
);

// ── codcli 0: trim del padding ──────────────────────────────────────
const c0 = result.clients.find((c) => c.codcli === "0");
assert("codcli '       0' se hace trim a '0'", !!c0);
eq("codcli 0: email null (vacío)", c0?.email, null);
eq("codcli 0: nif vacío", c0?.nif, "");

// ── codcli 1: cliente normal ────────────────────────────────────────
const c1 = result.clients.find((c) => c.codcli === "1");
eq("codcli 1: nombre", c1?.name, "EMPRESA ALFA SL");
eq("codcli 1: email", c1?.email, "alfa@ejemplo.test");
eq("codcli 1: nif", c1?.nif, "B11111111");
eq("codcli 1: phone", c1?.phone, "911111111");
eq("codcli 1: no bloqueado", c1?.blocked, false);

// ── codcli 2: email múltiple → coge el primero ──────────────────────
const c2 = result.clients.find((c) => c.codcli === "2");
eq("codcli 2: email múltiple → primero", c2?.email, "uno@ejemplo.test");

// ── codcli 3: bloqueado (T ≠ F) ─────────────────────────────────────
const c3 = result.clients.find((c) => c.codcli === "3");
eq("codcli 3: blocked=true", c3?.blocked, true);

// ── codcli 4: acentos literales UTF-8 preservados ───────────────────
const c4 = result.clients.find((c) => c.codcli === "4");
eq("codcli 4: acentos UTF-8 literales", c4?.name, "ÑOÑO ACENTÚAS SL");

// ── codcli 5: HTML entity &aacute; decodificada ─────────────────────
const c5 = result.clients.find((c) => c.codcli === "5");
eq("codcli 5: entity &aacute; → á", c5?.name, "EMPRESA áCIDA SL");

// ── codcli 6: sin NIF → nif vacío, email sí ─────────────────────────
const c6 = result.clients.find((c) => c.codcli === "6");
eq("codcli 6: nif vacío", c6?.nif, "");
eq("codcli 6: email presente", c6?.email, "sin-nif@ejemplo.test");

// ── codcli 7: email malformado → null ───────────────────────────────
const c7 = result.clients.find((c) => c.codcli === "7");
eq("codcli 7: email malformado → null", c7?.email, null);

// ── codcli 9: última fila válida (verifica que el loop no se rompió) ─
const c9 = result.clients.find((c) => c.codcli === "9");
assert("codcli 9 se procesó (loop no rompió por fila malformada)", !!c9);
eq("codcli 9: email", c9?.email, "ultima@ejemplo.test");

// ── HTML sin tbody → error global, 0 clientes ───────────────────────
const noTbody = parseModalClientsTable("<table>nada de tbody</table>");
eq("sin tbody: 0 clientes", noTbody.clients.length, 0);
eq("sin tbody: 1 error", noTbody.errors.length, 1);
assert("sin tbody: error con rowIndex -1", noTbody.errors[0]?.rowIndex === -1);

// ── HTML completamente vacío ───────────────────────────────────────
const empty = parseModalClientsTable("");
eq("vacío: 0 clientes", empty.clients.length, 0);
eq("vacío: totalPages null", empty.totalPages, null);

// ── Footer ausente → totalPages null ───────────────────────────────
const noFooter = parseModalClientsTable(
  '<table><tbody><tr><td><strong>1</strong></td><td><strong>X</strong></td><td><strong>X</strong></td><td><strong></strong></td><td><strong></strong></td><td><strong></strong></td><td><strong>F</strong></td></tr></tbody></table>'
);
eq("sin footer: totalPages null", noFooter.totalPages, null);
eq("sin footer: 1 cliente parseado igual", noFooter.clients.length, 1);

// ── extractFirstEmail aislado ──────────────────────────────────────
console.log("\n=== extractFirstEmail tests ===\n");
eq("email único", extractFirstEmail("foo@bar.com"), "foo@bar.com");
eq("email múltiple ;", extractFirstEmail("a@x.com;b@x.com"), "a@x.com");
eq("email múltiple ,", extractFirstEmail("a@x.com,b@x.com"), "a@x.com");
eq("email múltiple espacio", extractFirstEmail("a@x.com b@x.com"), "a@x.com");
eq("email se normaliza a minúsculas", extractFirstEmail("FOO@BAR.COM"), "foo@bar.com");
eq("primero inválido, segundo válido", extractFirstEmail("invalido;b@x.com"), "b@x.com");
eq("ninguno válido → null", extractFirstEmail("no;no-tampoco"), null);
eq("vacío → null", extractFirstEmail(""), null);
eq("solo espacios → null", extractFirstEmail("   "), null);

// ── Acentos en fields que no son email ─────────────────────────────
const c4again: ParsedClient | undefined = result.clients.find(
  (c) => c.codcli === "4"
);
assert(
  "ñ y Ú se preservan en el nombre",
  c4again?.name.includes("Ñ") && c4again?.name.includes("Ú")
);

// ──────────────────────────────────────────────────────────────────────
// Routing del response (selectModalClientsHtml)
//
// Decide qué HTML pasar al parser según el formato de respuesta de
// iRecursos. Probado offline: HTML pelado (caso esperado), XJX-envuelto
// (salvaguarda), y formatos no reconocidos.
// ──────────────────────────────────────────────────────────────────────
console.log("\n=== selectModalClientsHtml routing ===\n");

// (1) HTML pelado (caso esperado: respuesta real de iRecursos)
const rawHtmlBody = `\t\t<table class="table table-normal table-hover">\n<thead></thead>\n<tbody></tbody>\n</table>`;
{
  const out = selectModalClientsHtml(rawHtmlBody);
  eq("HTML pelado: devuelve el body tal cual", out, rawHtmlBody);
}

// (2) HTML pelado COMPLETO con el fixture sintético → parser extrae los 9
{
  const out = selectModalClientsHtml(SYNTHETIC_HTML);
  const parsed = parseModalClientsTable(out);
  eq("HTML pelado → parser extrae 9 clientes", parsed.clients.length, 9);
  eq("HTML pelado → totalPages 447", parsed.totalPages, 447);
}

// (3) XJX envuelto (salvaguarda): cualquier respuesta que sí trajera el
// wrapper se desempaqueta correctamente
const xjxWrapped =
  `<?xml version="1.0" encoding="ISO-8859-1" ?><xjx>` +
  `<cmd cmd="as" id="modal_clients_CCODCLI" prop="value">SCODCLI</cmd>` +
  `<cmd cmd="as" id="MODAL_CLIENTS_TAULA" prop="innerHTML"><![CDATA[S${SYNTHETIC_HTML}]]></cmd>` +
  `</xjx>`;
{
  const out = selectModalClientsHtml(xjxWrapped);
  // Debe devolver el HTML INTERNO (la tabla), no el wrapper
  assert(
    "XJX envuelto: NO devuelve el wrapper <xjx>",
    !out.includes("<xjx>")
  );
  assert(
    "XJX envuelto: devuelve la tabla interna",
    out.includes('<table class="table table-normal table-hover">')
  );
  const parsed = parseModalClientsTable(out);
  eq("XJX envuelto → parser extrae 9 clientes", parsed.clients.length, 9);
}

// (4) Formato desconocido: ni XJX ni tabla → lanza IRecursosError
{
  let thrown: Error | null = null;
  try {
    selectModalClientsHtml("<html><body>error generico</body></html>");
  } catch (err) {
    thrown = err as Error;
  }
  assert("desconocido: lanza", thrown !== null);
  assert(
    "desconocido: mensaje descriptivo",
    thrown?.message?.includes("Respuesta no reconocida") ?? false
  );
}

// (5) XJX malformado sin MODAL_CLIENTS_TAULA → lanza
{
  const xjxNoCmd = `<?xml version="1.0" ?><xjx><cmd cmd="as" id="OTRO_COSO">SX</cmd></xjx>`;
  let thrown: Error | null = null;
  try {
    selectModalClientsHtml(xjxNoCmd);
  } catch (err) {
    thrown = err as Error;
  }
  assert("XJX sin MODAL_CLIENTS_TAULA: lanza", thrown !== null);
  assert(
    "XJX sin MODAL_CLIENTS_TAULA: mensaje descriptivo",
    thrown?.message?.includes("MODAL_CLIENTS_TAULA") ?? false
  );
}

// (6) Body vacío → router NO debería ser invocado (caller filtra con
// detectIrecursosFatalError primero). Pero si lo es, lanza desconocido.
{
  let thrown: Error | null = null;
  try {
    selectModalClientsHtml("");
  } catch (err) {
    thrown = err as Error;
  }
  assert("body vacío: lanza", thrown !== null);
}

// ──────────────────────────────────────────────────────────────────────
// Verificación contra HTML pelado REAL (reconstruido a partir de la
// muestra anónima de la respuesta real). Reproduce la estructura exacta
// que devuelve `A-imprimir-llistat-embded.php?mf_format=7`: tabs y
// whitespace tal cual, <strong> en cada celda, footer "Pág. X de N".
// ──────────────────────────────────────────────────────────────────────
console.log("\n=== Parser contra HTML pelado real (estructura idéntica) ===\n");

const REAL_RAW_HTML = `\t\t<table class="table table-normal table-hover">
\t\t<thead>
\t\t<tr>
                \t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>Cód. cliente</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>Nombre comercial de la organización</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>Organización</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>NIF</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>Teléfono</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>E-Mail</strong></td>
\t\t\t\t\t\t\t\t\t<td style="width:0px; min-width:100px;"><strong>Bloqueado</strong></td>
\t\t</tr>
\t\t</thead>
\t\t<tbody>
\t\t\t\t<tr style="cursor:pointer;" onclick="$('#CODCLI').val('       0'); $('#CODCLI').trigger('change');">
                                \t\t\t\t\t<td><strong>       0</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>EJEMPLO ANONIMO SL</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>EJEMPLO ANONIMO SL</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong></strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong></strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong></strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>F</strong></td>
\t\t\t\t\t\t\t\t</tr>
\t\t\t\t<tr style="cursor:pointer;" onclick="$('#CODCLI').val('       1'); $('#CODCLI').trigger('change');">
                                \t\t\t\t\t<td><strong>       1</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>ANONIMO UNO SL</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>ANONIMO UNO SL</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>X00000001Y</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>910000001</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>uno@anonimo.test</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>F</strong></td>
\t\t\t\t\t\t\t\t</tr>
\t\t\t\t<tr style="cursor:pointer;" onclick="$('#CODCLI').val('       5'); $('#CODCLI').trigger('change');">
                                \t\t\t\t\t<td><strong>       5</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>ANONIMO MULTI SA</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>ANONIMO MULTI SA</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>A00000005</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>910000005</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>primero@anon.test;segundo@anon.test</strong></td>
\t\t\t\t                \t\t\t\t\t<td><strong>F</strong></td>
\t\t\t\t\t\t\t\t</tr>
\t\t</tbody>
\t\t<tfoot>
\t\t<tr class="table-footer">
\t\t<td colspan="7">
\t\t\t<div class="pull-right"><span class="text-info">Pág. 1 de 447</span></div>
\t\t</td></tr>
\t\t</tfoot>
\t\t</table>
\t\t`;

{
  // Simulamos el flujo COMPLETO: selectModalClientsHtml → parser
  const html = selectModalClientsHtml(REAL_RAW_HTML);
  const result = parseModalClientsTable(html);

  eq("real HTML: 3 clientes", result.clients.length, 3);
  eq("real HTML: 0 errores de parsing", result.errors.length, 0);
  eq("real HTML: totalPages 447", result.totalPages, 447);

  const c0 = result.clients.find((c) => c.codcli === "0");
  eq("real HTML c0: codcli sin padding", c0?.codcli, "0");
  eq("real HTML c0: nif vacío", c0?.nif, "");
  eq("real HTML c0: email null", c0?.email, null);
  eq("real HTML c0: no bloqueado", c0?.blocked, false);

  const c1 = result.clients.find((c) => c.codcli === "1");
  eq("real HTML c1: nombre", c1?.name, "ANONIMO UNO SL");
  eq("real HTML c1: email", c1?.email, "uno@anonimo.test");
  eq("real HTML c1: nif", c1?.nif, "X00000001Y");

  const c5 = result.clients.find((c) => c.codcli === "5");
  eq(
    "real HTML c5: email múltiple → primero",
    c5?.email,
    "primero@anon.test"
  );
}

// ──────────────────────────────────────────────────────────────────────
// Construcción del body de la petición (buildModalClientsXjxObj)
//
// iRecursos espera el formulario form_modal_clients COMPLETO, no solo
// PAGINA. Sin todos los campos, devuelve HTML sin tbody. Verificamos
// que el xjxobj contiene los 23 campos y que solo PAGINA cambia entre
// invocaciones.
// ──────────────────────────────────────────────────────────────────────
console.log("\n=== buildModalClientsXjxObj ===\n");

// (1) El número de campos coincide con lo capturado del form
eq("23 campos del formulario", MODAL_CLIENTS_FORM_FIELD_COUNT, 23);

// (2) El xjxobj tiene exactamente 23 <e>...</e>
const xjxPage1 = buildModalClientsXjxObj(1);
const eMatches1 = xjxPage1.match(/<e>/g) ?? [];
eq("23 entries <e> en el xjxobj", eMatches1.length, 23);

// (3) Wrappeado en <xjxobj>...</xjxobj>
assert(
  "empieza con <xjxobj>",
  xjxPage1.startsWith("<xjxobj>")
);
assert("termina con </xjxobj>", xjxPage1.endsWith("</xjxobj>"));

// (4) Campos críticos presentes con sus valores por defecto
const requiredFields: Array<[string, string]> = [
  ["FILTRE_MODAL_CLIENTS", ""],
  ["modal_clients_PAGINA", "1"],
  ["modal_clients_REGSXPAG", "10"],
  ["modal_clients_ORD", "NOMCLI"],
  ["modal_clients_CCODCLI", "CODCLI"],
  ["modal_clients_CNOMCLI", "NOMCLI"],
  ["modal_clients_PROJECTE", ""],
  ["modal_clients_OT", ""],
  ["modal_clients_CONTRACTE", ""],
  ["modal_clients_NUMPAGINES", ""],
  ["modal_clients_PAGINASEG", ""],
  ["modal_clients_PAGINAANT", ""],
  ["modal_clients_QUANTS", ""],
  ["modal_clients_REGINI", ""],
  ["modal_clients_REGFIN", ""],
  ["modal_clients_NUMPAG", ""],
  ["modal_clients_ORDT", ""],
  ["modal_clients_prefix", ""],
  ["modal_clients_accio", ""],
  ["modal_clients_redireccio", ""],
  ["modal_clients_camp_dirent", ""],
  ["modal_clients_IDDIRENT", ""],
  ["modal_clients_capa_resum", ""],
];
for (const [k, v] of requiredFields) {
  const expected = `<e><k>${k}</k><v>S${v}</v></e>`;
  assert(
    `campo ${k}="${v}"`,
    xjxPage1.includes(expected),
    `no encontré: ${expected}`
  );
}

// (5) PAGINA cambia con el argumento, el resto NO
const xjxPage5 = buildModalClientsXjxObj(5);
assert(
  "PAGINA=5 presente en page 5",
  xjxPage5.includes("<e><k>modal_clients_PAGINA</k><v>S5</v></e>")
);
assert(
  "PAGINA=1 NO presente en page 5",
  !xjxPage5.includes("<e><k>modal_clients_PAGINA</k><v>S1</v></e>")
);
// REGSXPAG sigue siendo 10
assert(
  "REGSXPAG=10 sigue presente en page 5",
  xjxPage5.includes("<e><k>modal_clients_REGSXPAG</k><v>S10</v></e>")
);

// (6) Diff página 1 vs página 5: solo cambia PAGINA
const diff = xjxPage1.replace(
  "<e><k>modal_clients_PAGINA</k><v>S1</v></e>",
  "<e><k>modal_clients_PAGINA</k><v>S5</v></e>"
);
eq("solo difiere PAGINA entre páginas distintas", diff, xjxPage5);

// (7) Validación de pageNumber
{
  let thrown = false;
  try { buildModalClientsXjxObj(0); } catch { thrown = true; }
  assert("page=0 lanza", thrown);
}
{
  let thrown = false;
  try { buildModalClientsXjxObj(-1); } catch { thrown = true; }
  assert("page=-1 lanza", thrown);
}
{
  let thrown = false;
  try { buildModalClientsXjxObj(1.5); } catch { thrown = true; }
  assert("page=1.5 lanza", thrown);
}

// (8) Dump del body completo para que el usuario lo compare con su captura
console.log("\n--- Body COMPLETO para página 1 (para comparar con captura) ---");
console.log(xjxPage1);
console.log("\n--- Body COMPLETO para página 2 ---");
console.log(buildModalClientsXjxObj(2));

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) {
  console.log("\nFallos:");
  for (const f of [] as string[]) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
