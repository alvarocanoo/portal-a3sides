import { requireAuth } from "@/lib/auth/helpers";
import { CambiarPasswordForm } from "./cambiar-password-form";
import { BrandPanel } from "@/components/layout/brand-panel";

export default async function CambiarPasswordPage() {
  // El servidor lee la sesión y pasa al form si está en primer-acceso,
  // para que el formulario decida mostrar (o no) el campo "contraseña
  // actual". Mismo split-screen que /login para que las dos pantallas
  // de auth formen una familia visual coherente.
  const session = await requireAuth();
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      <BrandPanel />

      <main className="flex-1 flex items-center justify-center px-6 py-10 md:p-12">
        <CambiarPasswordForm
          mustChangePassword={session.user.mustChangePassword}
        />
      </main>
    </div>
  );
}
