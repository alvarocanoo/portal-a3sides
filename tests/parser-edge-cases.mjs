// Tests sinteticos del parser con HTML construido a mano para cubrir
// casos que no aparecen en la muestra real (estados no activos, tildes,
// referencia rellena, panel sin seccion, etc.)

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parse(html) {
  if (
    html.length < 1000 ||
    !html.includes("Panel cliente") ||
    html.includes("error.php?msg=No tiene permisos")
  ) return [];
  const sectionMatch = html.match(/id="pcontractes_CONTENT"[\s\S]*?<\/table>/);
  if (!sectionMatch) return [];
  const out = [];
  const rowRegex = /<tr[^>]*class="[^"]*NEGRE[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(sectionMatch[0])) !== null) {
    const row = m[1];
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    if (tds.length < 3) continue;
    const refCell = tds[0][2];
    const descCell = tds[1][2];
    const stateAttrs = tds[2][1];
    const stateCell = tds[2][2];
    const idMatch =
      refCell.match(/A-contractes\.php\?id=(\d+)/) ||
      descCell.match(/A-contractes\.php\?id=(\d+)/);
    const id = idMatch?.[1];
    if (!id) continue;
    const descTextMatch = descCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const description = decodeHtmlEntities(
      (descTextMatch?.[1] || descCell).replace(/<[^>]+>/g, "")
    ).replace(/\s+/g, " ").trim();
    if (!description) continue;
    const stateText = decodeHtmlEntities(stateCell.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ").trim();
    const isActive =
      stateAttrs.includes("text-success") || stateText.toUpperCase() === "ACTIVO";
    if (isActive) out.push({ id, description, state: stateText || "ACTIVO" });
  }
  return out;
}

function shell(rows) {
  return `<html><head><title>Panel cliente: TEST - A3 SIDES - iRecursos</title></head><body>${"x".repeat(1100)}
<div id="pcontractes_CONTENT">
<table>${rows.map(r => `<tr class="NEGRE">${r}</tr>`).join("\n")}</table>
</div></body></html>`;
}

function pass(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) {
    console.log("  esperado:", JSON.stringify(expected));
    console.log("  obtenido:", JSON.stringify(actual));
    process.exitCode = 1;
  }
}

// 1. Estado INACTIVO debe filtrarse
pass("Estado INACTIVO se filtra",
  parse(shell([
    `<td class="TD_L"><a href="A-contractes.php?id=100"></a></td>
     <td><a href="A-contractes.php?id=100">CONTRATO_X</a></td>
     <td class="TD_L text-error">INACTIVO</td>`,
  ])),
  []
);

// 2. Estado VENCIDO debe filtrarse
pass("Estado VENCIDO se filtra",
  parse(shell([
    `<td class="TD_L"><a href="A-contractes.php?id=101"></a></td>
     <td><a href="A-contractes.php?id=101">CONTRATO_Y</a></td>
     <td class="TD_L text-warning">VENCIDO</td>`,
  ])),
  []
);

// 3. Mezcla: activo + inactivo → solo el activo
pass("Mezcla activo/inactivo: solo activo",
  parse(shell([
    `<td><a href="A-contractes.php?id=200"></a></td>
     <td><a href="A-contractes.php?id=200">VIGENTE</a></td>
     <td class="text-success">ACTIVO</td>`,
    `<td><a href="A-contractes.php?id=201"></a></td>
     <td><a href="A-contractes.php?id=201">CADUCADO</a></td>
     <td class="text-error">INACTIVO</td>`,
  ])),
  [{ id: "200", description: "VIGENTE", state: "ACTIVO" }]
);

// 4. Tildes y ñ se decodifican (entrada decodificada ya como UTF-8 simulando TextDecoder)
pass("Tildes y ñ se preservan",
  parse(shell([
    `<td><a href="A-contractes.php?id=300"></a></td>
     <td><a href="A-contractes.php?id=300">GESTIÓN AÑO 2026</a></td>
     <td class="text-success">ACTIVO</td>`,
  ])),
  [{ id: "300", description: "GESTIÓN AÑO 2026", state: "ACTIVO" }]
);

// 5. Entidades HTML
pass("Entidades HTML se decodifican",
  parse(shell([
    `<td><a href="A-contractes.php?id=400"></a></td>
     <td><a href="A-contractes.php?id=400">A&amp;B SERVICIOS</a></td>
     <td class="text-success">ACTIVO</td>`,
  ])),
  [{ id: "400", description: "A&B SERVICIOS", state: "ACTIVO" }]
);

// 6. Referencia rellena (no debe afectar la descripcion)
pass("Referencia rellena: id sigue extrayendose, descripcion correcta",
  parse(shell([
    `<td><a href="A-contractes.php?id=500">REF-2026</a></td>
     <td><a href="A-contractes.php?id=500">MANTENIMIENTO</a></td>
     <td class="text-success">ACTIVO</td>`,
  ])),
  [{ id: "500", description: "MANTENIMIENTO", state: "ACTIVO" }]
);

// 7. Panel sin seccion CONTRATOS ACTIVOS
pass("Panel sin seccion: devuelve []",
  parse(`<html><title>Panel cliente: X - A3 SIDES - iRecursos</title>${"x".repeat(1200)}</html>`),
  []
);

// 8. Pagina pequeña (sesion caducada): devuelve []
pass("HTML demasiado pequeño: devuelve []",
  parse(`<script>document.location='error'</script>`),
  []
);

// 9. Pagina con marca de no-permisos: devuelve []
pass("Sin permisos: devuelve []",
  parse(`Panel cliente xxx error.php?msg=No tiene permisos ${"x".repeat(1100)}`),
  []
);

// 10. Sin id en href: la fila se rechaza
pass("Fila sin id valido: se rechaza",
  parse(shell([
    `<td><a href="javascript:void(0)"></a></td>
     <td><a href="javascript:void(0)">SIN_ID</a></td>
     <td class="text-success">ACTIVO</td>`,
  ])),
  []
);

// 11. Estado "ACTIVO" con espacios alrededor (caso real visto en iRecursos)
pass("Estado con espacios: ACTIVO seguido de espacio",
  parse(shell([
    `<td><a href="A-contractes.php?id=600"></a></td>
     <td><a href="A-contractes.php?id=600">CON ESPACIOS</a></td>
     <td class="TD_L text-success">ACTIVO </td>`,
  ])),
  [{ id: "600", description: "CON ESPACIOS", state: "ACTIVO" }]
);

console.log("\nTests sinteticos completados.");
