import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { validatePassword } from "@/lib/password-policy";

const changePasswordSchema = z.object({
  oldPassword: z.string().optional(),
  password: z.string().superRefine((val, ctx) => {
    const result = validatePassword(val);
    if (!result.valid) {
      ctx.addIssue({
        code: "custom",
        message:
          "La contraseña no cumple los requisitos: " +
          result.failed.join("; "),
      });
    }
  }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Cargamos el usuario para acceder a passwordHash y al flag de cambio
    // obligatorio. mustChangePassword se lee de la BD (no del JWT) para
    // que un atacante con un JWT viejo no pueda fingir flujo de primer
    // acceso.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, mustChangePassword: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // ── Verificación de la contraseña actual ─────────────────────────
    // Para usuarios normales: oldPassword es obligatoria y debe coincidir.
    // Excepción: si el usuario está en primer-acceso (mustChangePassword=true)
    // se permite sin oldPassword — ya autenticó con la contraseña temporal
    // para llegar aquí. Esto evita pedirle al usuario su propia temporal
    // recién usada para iniciar sesión.
    // ─────────────────────────────────────────────────────────────────
    if (!user.mustChangePassword) {
      if (!parsed.data.oldPassword) {
        return NextResponse.json(
          { error: "La contraseña actual es obligatoria" },
          { status: 400 }
        );
      }
      const valid = await compare(parsed.data.oldPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "La contraseña actual no es correcta" },
          { status: 401 }
        );
      }
    }

    const passwordHash = await hash(parsed.data.password, 12);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
