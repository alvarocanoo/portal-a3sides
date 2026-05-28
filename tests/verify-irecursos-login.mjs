// Verifica que el login a iRecursos funciona end-to-end.
// NO imprime credenciales ni valores de cookies.
import { readFileSync } from "fs";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.IRECURSOS_BASE_URL;
const USER = process.env.IRECURSOS_USER;
const PASS = process.env.IRECURSOS_PASSWORD;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildXjxBody(fun, args) {
  const p = new URLSearchParams();
  p.append("xjxfun", fun);
  args.forEach((a) => p.append("xjxargs[]", a));
  p.append("xjxr", Date.now().toString());
  return p.toString();
}

function buildLoginArgs(u, pw) {
  return (
    `<xjxobj>` +
    `<e><k>userid</k><v>S${u}</v></e>` +
    `<e><k>password</k><v>S<![CDATA[${pw}]]></v></e>` +
    `<e><k>empresa</k><v>S</v></e>` +
    `<e><k>hp_check</k><v>S</v></e>` +
    `</xjxobj>`
  );
}

function extractCookies(headers) {
  const result = {};
  const setCookie = headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    if (c.startsWith("PHPSESSID=")) result.php = c.split("=")[1].split(";")[0];
    if (c.startsWith("ILEHD_SESSION=")) result.ilehd = c.split("=")[1].split(";")[0];
  }
  return result;
}

console.log("Verificando login completo a iRecursos...\n");

// Paso 1: GET inicial
const initRes = await fetch(`${BASE}/es/index.php`, {
  method: "GET",
  headers: { "User-Agent": USER_AGENT },
  redirect: "manual",
});
let cookies = extractCookies(initRes.headers);
console.log(`Paso 1 (GET inicial): status=${initRes.status} PHPSESSID=${cookies.php ? "OK" : "MISSING"}`);

// Paso 2: POST XJX login
const loginRes = await fetch(`${BASE}/es/index.php`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
    "X-Requested-With": "XMLHttpRequest",
    Referer: `${BASE}/es/index.php`,
    Cookie: cookies.php ? `PHPSESSID=${cookies.php}` : "",
  },
  body: buildXjxBody("ajax_validar", [buildLoginArgs(USER, PASS)]),
  redirect: "manual",
});
const loginXml = await loginRes.text();
const loginOk = loginXml.includes("<xjxrv>B1</xjxrv>");
cookies = { ...cookies, ...extractCookies(loginRes.headers) };
console.log(`Paso 2 (XJX login): status=${loginRes.status} xjxrv=${loginOk ? "B1 (OK)" : "FAIL"}`);

// Paso 3: POST validar.php con form completo
const validateRes = await fetch(`${BASE}/es/validar.php`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
    Referer: `${BASE}/es/index.php`,
    Cookie: `PHPSESSID=${cookies.php}`,
  },
  body: new URLSearchParams({
    userid: USER,
    password: PASS,
    empresa: "A3 SIDES",
    hp_check: "",
  }).toString(),
  redirect: "manual",
});
cookies = { ...cookies, ...extractCookies(validateRes.headers) };
console.log(`Paso 3 (validar.php form completo): status=${validateRes.status} PHPSESSID=${cookies.php ? "OK" : "MISSING"} ILEHD_SESSION=${cookies.ilehd ? "OK" : "MISSING"}`);

// Verificacion final: hacer una peticion autenticada y comprobar que NO redirige a login
const testRes = await fetch(`${BASE}/es/A-clients-panell.php?id=5412`, {
  method: "GET",
  headers: {
    "User-Agent": USER_AGENT,
    Cookie: `PHPSESSID=${cookies.php}; ILEHD_SESSION=${cookies.ilehd}`,
  },
  redirect: "manual",
});
const body = await testRes.text();
const sessionValid = !body.includes("caducado") && !body.includes("No tiene permisos") && body.includes("Panel cliente");
console.log(`\nVerificacion final (GET panel cliente):`);
console.log(`  Sesion valida: ${sessionValid ? "SI" : "NO"}`);
console.log(`  Tamano respuesta: ${body.length} chars`);
console.log(`\nResultado: ${sessionValid && cookies.php && cookies.ilehd ? "LOGIN OK" : "LOGIN INCOMPLETO"}`);

process.exit(sessionValid && cookies.php && cookies.ilehd ? 0 : 1);
