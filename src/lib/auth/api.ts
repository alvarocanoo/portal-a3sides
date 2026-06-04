import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

// ─── Helper de autorización para endpoints API ───────────
//
// Unifica los 3 checks que cada endpoint mutador repetía:
//   1. session?.user → 401 No autenticado.
//   2. role en lista → 403 No autorizado (si se piden roles concretos).
//   3. mustChangePassword=false → 403 DEBE_CAMBIAR_PASSWORD (default).
//
// Antes era código duplicado en 12 endpoints (riesgo: olvidar uno
// al añadir endpoint nuevo). Ahora un solo punto.
//
// Uso típico:
//
//   export async function POST(request: Request) {
//     try {
//       const authz = await authorizeApi({ roles: ["ADMIN"] });
//       if (!authz.ok) return authz.response;
//       const { session } = authz;
//       // ... resto del handler usa session.user.id, etc.
//     } catch { return 500; }
//   }
//
// Para endpoints sin restricción de rol concreto (cualquier autenticado):
//   const authz = await authorizeApi();
//
// Para casos especiales con mensaje de error custom (ej. POST /incidents
// que dice "Solo los clientes pueden crear"), llamar authorizeApi() sin
// roles y hacer el check de rol explícito después con su mensaje propio.
//
// NO usar para change-password (se bloquearía a sí mismo). Y NO usar
// para GETs de lectura (decidimos no bloquearlos por mustChangePassword
// — hallazgo §1.3). Ver CLAUDE.md §8 si tienes dudas.

export interface AuthorizeApiOptions {
  /** Si se pasa: el rol debe estar en la lista. Si no: cualquier
   *  autenticado pasa (el endpoint hace el check de rol después). */
  roles?: Role[];
  /** Default true. Solo poner a false en endpoints que el usuario con
   *  mustChangePassword DEBE poder usar (en la práctica, ninguno de los
   *  12 mutadores — esto se usaría hipotéticamente para change-password). */
  requirePasswordChanged?: boolean;
}

export type AuthorizeApiResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export async function authorizeApi(
  options: AuthorizeApiOptions = {}
): Promise<AuthorizeApiResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      ),
    };
  }

  if (options.roles && !options.roles.includes(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      ),
    };
  }

  const checkPwd = options.requirePasswordChanged !== false;
  if (checkPwd && session.user.mustChangePassword) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "DEBE_CAMBIAR_PASSWORD" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}
