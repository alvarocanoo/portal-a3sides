import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";

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

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        if (!user || !user.isActive) return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

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
