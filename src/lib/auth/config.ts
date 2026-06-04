import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";

// ─── Lockout por email contra fuerza bruta (hallazgo §1.2) ───
// 5 fallos en 15 min → bloqueo. Acierto resetea (deleteMany).
// Solo registramos fallos para usuarios reales y activos → evita
// llenar la tabla con basura de emails enumerados y limita el DoS.
// Trade-off conocido: un atacante puede inducir lockout contra un
// email real válido (5 fallos = 15min sin acceso). La protección
// por IP queda como tarea futura (§1.2 parte 2).
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        // 1) Lockout check ANTES de findUnique/bcrypt. Si está bloqueado:
        //    null directo. Ahorra ~250ms de bcrypt por intento atacante.
        const cutoff = new Date(Date.now() - LOCKOUT_WINDOW_MS);
        const recentFails = await prisma.loginAttempt.count({
          where: { email, createdAt: { gte: cutoff } },
        });
        if (recentFails >= LOCKOUT_THRESHOLD) return null;

        // 2) Buscar usuario.
        const user = await prisma.user.findUnique({ where: { email } });

        // 3) Sin usuario o inactivo: null SIN registrar fallo. Razón:
        //    si registráramos, un atacante podría llenar la tabla con
        //    intentos contra emails enumerados o desactivados, dejando
        //    bloqueados a usuarios que ni siquiera tienen sesión activa.
        //    Solo cuentas reales y activas merecen lockout.
        if (!user || !user.isActive) return null;

        // 4) Verificar password.
        const isValid = await compare(password, user.passwordHash);
        if (!isValid) {
          await prisma.loginAttempt.create({ data: { email } });
          return null;
        }

        // 5) Éxito: limpiar intentos previos. Acierto resetea contador.
        await prisma.loginAttempt.deleteMany({ where: { email } });

        // 6) Resto del flujo original.
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          companyId: user.companyId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Sign-in inicial: datos directos de authorize(). El usuario
        // acaba de pasar el check de password + isActive en authorize,
        // no hace falta re-fetch.
        token.id = user.id!;
        token.role = user.role;
        token.companyId = user.companyId;
        token.mustChangePassword = user.mustChangePassword;
        return token;
      }

      // Request posterior al login: revalidamos contra BD para que los
      // cambios en BD (isActive, role, companyId, mustChangePassword) se
      // reflejen en la SIGUIENTE request, no a las 24h cuando caduca el
      // JWT. Cierra hallazgo §1.1 de la auditoría: hasta ahora el bloque
      // de revalidación solo se disparaba con trigger==="update" (que
      // nadie llamaba en el código), así que un usuario desactivado por
      // un admin seguía operando con su JWT durante hasta 24h.
      //
      // Coste: 1 findUnique por request autenticado (~0.1-0.5ms con índice
      // por PK en Neon postgres). Despreciable para el volumen esperado.
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            isActive: true,
            role: true,
            mustChangePassword: true,
            companyId: true,
          },
        });

        if (!dbUser || !dbUser.isActive) {
          // Usuario eliminado o desactivado → invalidar sesión. Throw
          // aquí hace que NextAuth trate el token como inválido y la
          // siguiente capa (auth()) devuelve null. La cookie sigue en
          // el navegador hasta caducar (Max-Age del JWT) pero cada
          // request la rechaza limpiamente.
          throw new Error("USER_INACTIVE");
        }

        // Refrescar campos que pueden cambiar sin nuevo login:
        //   role           → admin promueve a un agente.
        //   companyId      → admin mueve a un CLIENT a otra empresa.
        //                    SIN esto, el CLIENT vería las incidencias
        //                    de su empresa anterior hasta caducar JWT.
        //   mustChangePassword → ya estaba antes; mantenido.
        token.role = dbUser.role;
        token.companyId = dbUser.companyId;
        token.mustChangePassword = dbUser.mustChangePassword;
      } catch (err) {
        // USER_INACTIVE se propaga (queremos invalidar).
        if (err instanceof Error && err.message === "USER_INACTIVE") throw err;
        // Fail-OPEN si la BD parpadea: si está caída, el resto del portal
        // también lo está (todas las queries de Prisma fallan); bloquear
        // SOLO auth amplifica el outage sin añadir seguridad real — un
        // atacante no puede "esperar a que la BD se caiga". Mantenemos
        // el token cacheado y reintentamos en la siguiente request.
        console.warn(
          "[auth] revalidación falló, manteniendo token cacheado:",
          err
        );
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.companyId = token.companyId;
      session.user.mustChangePassword = token.mustChangePassword;
      return session;
    },
  },
};
