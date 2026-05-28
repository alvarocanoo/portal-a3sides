// Sonda aislada para verificar que las credenciales SMTP funcionan.
// NO imprime credenciales en stdout.
import { readFileSync } from "fs";
import nodemailer from "nodemailer";

const envLocal = readFileSync(".env.local", "utf-8");
for (const line of envLocal.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || "587", 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM;

if (!host || !user || !pass) {
  console.error("Falta SMTP_HOST/USER/PASS en .env.local");
  process.exit(1);
}

console.log(`Conectando a ${host}:${port}...`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

// Verificar conexion sin enviar
try {
  await transporter.verify();
  console.log("Conexion SMTP: OK (credenciales validas)");
} catch (e) {
  console.error("FAIL - conexion SMTP:", e.message);
  process.exit(1);
}

// Enviar un email de prueba
console.log("Enviando email de prueba...");
try {
  const info = await transporter.sendMail({
    from,
    to: "test@example.com",
    subject: "[Sonda SMTP] Verificacion de configuracion",
    html: `
      <h2>Prueba de envio</h2>
      <p>Si ves este email en tu bandeja de Mailtrap, la configuracion SMTP del portal funciona correctamente.</p>
      <p>Fecha: ${new Date().toLocaleString("es-ES")}</p>
    `,
  });
  console.log(`Email enviado. messageId: ${info.messageId}`);
  console.log("Ahora abre tu bandeja de Mailtrap — deberia haber llegado.");
} catch (e) {
  console.error("FAIL - envio:", e.message);
  process.exit(1);
}
