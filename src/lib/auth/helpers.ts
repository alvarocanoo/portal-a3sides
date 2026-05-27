import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requirePasswordChanged() {
  const session = await requireAuth();
  if (session.user.mustChangePassword) {
    redirect("/cambiar-password");
  }
  return session;
}
