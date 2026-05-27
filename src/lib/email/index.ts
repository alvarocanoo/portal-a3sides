import nodemailer from "nodemailer";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST;

  if (!host) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log("[EMAIL - modo consola]");
    console.log(`  Para: ${input.to}`);
    console.log(`  Asunto: ${input.subject}`);
    console.log(`  Contenido: ${input.html.slice(0, 200)}...`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "Portal a3sides <noreply@a3sides.es>",
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return true;
  } catch (error) {
    console.error("[EMAIL] Error al enviar:", error);
    return false;
  }
}
