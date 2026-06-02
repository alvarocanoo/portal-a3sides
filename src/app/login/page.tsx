import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { BrandPanel } from "@/components/layout/brand-panel";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      <BrandPanel />

      {/* ── PANEL DERECHO (FORMULARIO) ────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-10 md:p-12">
        <div className="w-full max-w-sm">
          {/* Encabezado discreto del form. */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Iniciar sesión
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Accede a tu cuenta de a3sides.
            </p>
          </div>

          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div>
        <div className="h-3 w-12 bg-gray-200 rounded mb-1.5" />
        <div className="h-[42px] w-full bg-gray-100 rounded-lg" />
      </div>
      <div>
        <div className="h-3 w-20 bg-gray-200 rounded mb-1.5" />
        <div className="h-[42px] w-full bg-gray-100 rounded-lg" />
      </div>
      <div className="pt-2">
        <div className="h-[42px] w-full bg-[#275d6b]/30 rounded-lg" />
      </div>
    </div>
  );
}
