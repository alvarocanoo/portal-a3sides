const BASE_URL = process.env.AUTH_URL || "http://localhost:3000";

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden">
      <div style="background:#2563eb;padding:16px 24px">
        <span style="color:#fff;font-size:18px;font-weight:700">a3sides</span>
        <span style="color:#93c5fd;font-size:14px;margin-left:8px">Soporte</span>
      </div>
      <div style="padding:24px">${content}</div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">
      Este email fue enviado automáticamente desde el Portal de Soporte de a3sides.
    </p>
  </div>
</body>
</html>`;
}

export function incidentCreatedClient(data: {
  reference: string;
  subject: string;
  incidentId: string;
}): { subject: string; html: string } {
  return {
    subject: `[${data.reference}] Incidencia recibida: ${data.subject}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px">Incidencia recibida</h2>
      <p style="color:#4b5563;margin:0 0 12px">Hemos recibido tu incidencia <strong>${data.reference}</strong>.</p>
      <p style="color:#4b5563;margin:0 0 16px">Nuestro equipo la revisará lo antes posible.</p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:0 0 16px">
        <p style="margin:0;font-size:14px;color:#6b7280">Asunto</p>
        <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:500">${data.subject}</p>
      </div>
      <a href="${BASE_URL}/incidencias/${data.incidentId}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Ver incidencia</a>
    `),
  };
}

export function incidentCreatedAgent(data: {
  reference: string;
  subject: string;
  companyName: string;
  createdBy: string;
  incidentId: string;
}): { subject: string; html: string } {
  return {
    subject: `[${data.reference}] Nueva incidencia de ${data.companyName}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px">Nueva incidencia</h2>
      <p style="color:#4b5563;margin:0 0 16px">${data.createdBy} de <strong>${data.companyName}</strong> ha abierto una incidencia.</p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:0 0 16px">
        <p style="margin:0;font-size:14px;color:#6b7280">${data.reference}</p>
        <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:500">${data.subject}</p>
      </div>
      <a href="${BASE_URL}/incidencias/${data.incidentId}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Abrir incidencia</a>
    `),
  };
}

export function newMessageNotification(data: {
  reference: string;
  subject: string;
  authorName: string;
  preview: string;
  incidentId: string;
}): { subject: string; html: string } {
  return {
    subject: `[${data.reference}] Nuevo mensaje de ${data.authorName}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px">Nuevo mensaje</h2>
      <p style="color:#4b5563;margin:0 0 16px"><strong>${data.authorName}</strong> ha respondido en la incidencia <strong>${data.reference}</strong>.</p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:0 0 16px">
        <p style="margin:0;font-size:14px;color:#6b7280">${data.subject}</p>
        <p style="margin:8px 0 0;font-size:14px;color:#374151">${data.preview.slice(0, 200)}${data.preview.length > 200 ? "..." : ""}</p>
      </div>
      <a href="${BASE_URL}/incidencias/${data.incidentId}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Ver conversación</a>
    `),
  };
}

export function statusChangedNotification(data: {
  reference: string;
  subject: string;
  newStatus: string;
  incidentId: string;
}): { subject: string; html: string } {
  const STATUS_LABELS: Record<string, string> = {
    OPEN: "Abierta",
    IN_PROGRESS: "En curso",
    WAITING_CLIENT: "Esperando tu respuesta",
    WAITING_THIRD_PARTY: "Escalada a tercero",
    RESOLVED: "Resuelta",
    CLOSED: "Cerrada",
  };

  return {
    subject: `[${data.reference}] Estado actualizado: ${STATUS_LABELS[data.newStatus] || data.newStatus}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px">Estado actualizado</h2>
      <p style="color:#4b5563;margin:0 0 16px">La incidencia <strong>${data.reference}</strong> ha cambiado de estado.</p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:0 0 16px">
        <p style="margin:0;font-size:14px;color:#6b7280">${data.subject}</p>
        <p style="margin:8px 0 0;font-size:16px;color:#111827;font-weight:600">${STATUS_LABELS[data.newStatus] || data.newStatus}</p>
      </div>
      <a href="${BASE_URL}/incidencias/${data.incidentId}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Ver incidencia</a>
    `),
  };
}

export function userInvitation(data: {
  firstName: string;
  email: string;
  tempPassword: string;
}): { subject: string; html: string } {
  return {
    subject: "Bienvenido al Portal de Soporte de a3sides",
    html: layout(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px">Bienvenido, ${data.firstName}</h2>
      <p style="color:#4b5563;margin:0 0 16px">Se ha creado tu cuenta en el Portal de Soporte de a3sides.</p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:0 0 16px">
        <p style="margin:0;font-size:14px;color:#6b7280">Tus credenciales de acceso</p>
        <p style="margin:8px 0 4px;font-size:14px;color:#374151"><strong>Email:</strong> ${data.email}</p>
        <p style="margin:0;font-size:14px;color:#374151"><strong>Contraseña temporal:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${data.tempPassword}</code></p>
      </div>
      <p style="color:#4b5563;margin:0 0 16px;font-size:14px">Deberás cambiar la contraseña en tu primer acceso.</p>
      <a href="${BASE_URL}/login" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Acceder al portal</a>
    `),
  };
}
