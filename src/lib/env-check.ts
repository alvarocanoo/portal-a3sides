/**
 * Validación de configuración al arranque para producción.
 *
 * Se llama desde src/instrumentation.ts cuando NODE_ENV === "production".
 * En desarrollo no se ejecuta — queremos permitir arrancar con SMTP en
 * modo consola, defaults, valores placeholder, etc.
 *
 * Filosofía: fallar al arranque con mensaje claro es MUCHO mejor que
 * fallar después en silencio o de forma confusa (cliente sin recibir
 * notificación, JWT falsificable, enlaces a localhost en emails, etc.).
 */

interface Issue {
  variable: string;
  problem: string;
  hint: string;
}

// Cualquier texto que sugiera que el valor sigue siendo el ejemplo:
// "CAMBIAR_*", "placeholder", "change_me", "<your-key-here>", etc.
const PLACEHOLDER_RE = /CAMBIAR|placeholder|change[_ -]?me|<your[_ -]/i;

/**
 * Comprueba si una ruta es absoluta. Inline en vez de usar `node:path`
 * porque este módulo se carga dinámicamente desde instrumentation.ts,
 * que el bundler de Next.js analiza también para Edge runtime (donde
 * "node:path" no está disponible). Acepta:
 *   - Unix: empieza por "/"
 *   - Windows: "C:\…", "C:/…"
 *   - UNC: "\\server\share"
 */
function isAbsolutePath(p: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(p);
}

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function validateProductionEnv(): void {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const env = process.env;

  // ── Modo demo local ────────────────────────────────────────────────
  // Escape hatch para correr el portal con `next start` localmente sin
  // tener que poner un AUTH_URL público falso (que rompería el logout y
  // otras redirecciones de NextAuth). Cuando esté activo:
  //   - se acepta AUTH_URL=localhost
  //   - el resto de validaciones de seguridad sigue intacto
  //     (AUTH_SECRET real, SMTP, DB, longitudes, etc.)
  //   - se imprime un banner muy visible al arranque para que sea
  //     evidente que NO es una producción de verdad.
  // NUNCA debe activarse en un despliegue público.
  // ──────────────────────────────────────────────────────────────────
  const ALLOW_LOCAL_PROD = env.ALLOW_LOCAL_PROD === "true";

  // ── AUTH_SECRET ────────────────────────────────────────────────────
  // Si se queda en el placeholder, cualquiera puede forjar JWTs válidos.
  // Si es corto, vulnerable a ataques de fuerza bruta sobre el HMAC.
  if (!env.AUTH_SECRET) {
    errors.push({
      variable: "AUTH_SECRET",
      problem: "no está definido",
      hint: "Genera uno seguro con: openssl rand -base64 32",
    });
  } else if (PLACEHOLDER_RE.test(env.AUTH_SECRET)) {
    errors.push({
      variable: "AUTH_SECRET",
      problem: 'todavía contiene el valor placeholder (p.ej. "CAMBIAR_*")',
      hint: "CRÍTICO: si se queda así, cualquiera con acceso al repo puede falsificar sesiones JWT. Genera uno real con: openssl rand -base64 32",
    });
  } else if (env.AUTH_SECRET.length < 32) {
    errors.push({
      variable: "AUTH_SECRET",
      problem: `solo tiene ${env.AUTH_SECRET.length} caracteres (mínimo recomendado: 32)`,
      hint: "Genera uno más largo con: openssl rand -base64 32",
    });
  }

  // ── AUTH_URL ──────────────────────────────────────────────────────
  // Lo usan los emails para construir enlaces (/incidencias/{id}, /login)
  // y NextAuth para resolver las redirecciones de signIn / signOut /
  // callbackUrl. Sin un AUTH_URL coherente con el host real, el logout
  // redirige a un dominio que no existe.
  if (!env.AUTH_URL) {
    errors.push({
      variable: "AUTH_URL",
      problem: "no está definida",
      hint: 'Configura la URL pública del portal, p.ej. AUTH_URL="https://portal.a3sides.es". Sin esto, los enlaces en los emails apuntarían a localhost:3000',
    });
  } else if (isLocalhostUrl(env.AUTH_URL)) {
    if (ALLOW_LOCAL_PROD) {
      // Modo demo local explícito — se acepta pero con warning ruidoso.
      warnings.push({
        variable: "AUTH_URL",
        problem: `apunta a localhost (${env.AUTH_URL})`,
        hint: "Aceptado por ALLOW_LOCAL_PROD=true (modo demo local). NUNCA actives ALLOW_LOCAL_PROD en una producción de verdad — los emails que reciban los clientes contendrían enlaces a localhost",
      });
    } else {
      errors.push({
        variable: "AUTH_URL",
        problem: `apunta a desarrollo (${env.AUTH_URL})`,
        hint: 'En producción debe ser la URL pública del portal, p.ej. "https://portal.a3sides.es". Si lo que quieres es correr el portal localmente con `npm start` para una demo, añade ALLOW_LOCAL_PROD="true" en tu .env.local y deja AUTH_URL="http://localhost:3000" — entonces el logout y las redirecciones de auth funcionarán contra localhost',
      });
    }
  }

  // ── DATABASE_URL ──────────────────────────────────────────────────
  // Prisma fallaría más tarde si falta, pero el error de Prisma es
  // críptico. Mejor decirlo aquí con claridad.
  if (!env.DATABASE_URL) {
    errors.push({
      variable: "DATABASE_URL",
      problem: "no está definida",
      hint: 'Configura la conexión a Postgres, p.ej. DATABASE_URL="postgresql://user:pass@host:5432/portal_a3sides?schema=public"',
    });
  }

  // ── SMTP ──────────────────────────────────────────────────────────
  // En producción, sin SMTP el portal es funcionalmente roto: los
  // clientes nunca reciben notificaciones de sus incidencias, los
  // usuarios nuevos nunca reciben la invitación con su contraseña, y
  // los resets de contraseña tampoco llegan. Encima sendEmail retorna
  // true (porque cae a console.log silenciosamente). Abortamos.
  if (!env.SMTP_HOST) {
    errors.push({
      variable: "SMTP_HOST",
      problem: "no está definido",
      hint: 'Configura un servidor SMTP (Resend/SendGrid/Mailgun/etc.), p.ej. SMTP_HOST="smtp.resend.com". Sin esto, los emails (invitaciones, resets, notificaciones) caerían a console.log y los clientes NUNCA recibirían nada — fallo silencioso',
    });
  } else {
    // SMTPs modernos requieren auth. Si SMTP_HOST está pero faltan
    // credenciales, lo más probable es config a medias.
    if (!env.SMTP_USER) {
      errors.push({
        variable: "SMTP_USER",
        problem: "SMTP_HOST configurado pero SMTP_USER no",
        hint: "Configura las credenciales SMTP completas (SMTP_USER + SMTP_PASS) — los SMTPs modernos las requieren para autenticarse",
      });
    }
    if (!env.SMTP_PASS) {
      errors.push({
        variable: "SMTP_PASS",
        problem: "SMTP_HOST configurado pero SMTP_PASS no",
        hint: "Configura las credenciales SMTP completas (SMTP_USER + SMTP_PASS)",
      });
    }
  }

  // ── UPLOAD_DIR (warning, no abort) ────────────────────────────────
  // Una ruta relativa dentro de Docker sin volume mount = archivos
  // perdidos al reiniciar. No abortamos porque en algunos despliegues
  // (no-Docker) una ruta relativa puede ser válida, pero registramos
  // un warning ruidoso para que el devops lo note.
  const uploadDir = env.UPLOAD_DIR || "./uploads";
  if (!isAbsolutePath(uploadDir)) {
    warnings.push({
      variable: "UPLOAD_DIR",
      problem: `es una ruta relativa (${uploadDir})`,
      hint: "En producción debería apuntar a un volumen persistente con ruta absoluta (p.ej. /var/lib/portal-a3sides/uploads). Con ruta relativa dentro de un contenedor Docker sin volume mount, los archivos se PIERDEN al reiniciar",
    });
  }

  // ── Report ────────────────────────────────────────────────────────
  if (ALLOW_LOCAL_PROD) {
    console.warn("");
    console.warn("⚠  ────────────────────────────────────────────────");
    console.warn("⚠   MODO DEMO LOCAL ACTIVO (ALLOW_LOCAL_PROD=true)");
    console.warn("⚠   AUTH_URL puede apuntar a localhost. NO usar en");
    console.warn("⚠   producción real.");
    console.warn("⚠  ────────────────────────────────────────────────");
    console.warn("");
  }

  if (warnings.length > 0) {
    console.warn("⚠  Advertencias de configuración (producción):");
    for (const w of warnings) {
      console.warn(`   • ${w.variable}: ${w.problem}`);
      console.warn(`     → ${w.hint}`);
    }
    console.warn("");
  }

  if (errors.length > 0) {
    const lines = [
      "",
      "✗ ERROR de configuración: el portal NO puede arrancar en producción.",
      "",
      `${errors.length} variable${errors.length > 1 ? "s" : ""} esencial${errors.length > 1 ? "es" : ""} mal configurada${errors.length > 1 ? "s" : ""}:`,
      "",
    ];
    for (const e of errors) {
      lines.push(`   • ${e.variable}: ${e.problem}`);
      lines.push(`     → ${e.hint}`);
      lines.push("");
    }
    lines.push(
      "Corrige estas variables en .env, .env.local, o las variables de entorno del despliegue, y reinicia."
    );
    lines.push("");
    console.error(lines.join("\n"));

    throw new Error(
      `Configuración de producción inválida: ${errors
        .map((e) => e.variable)
        .join(", ")}. Detalles arriba.`
    );
  }
}
