"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { SESSION_EXPIRED_EVENT } from "@/lib/api-fetch";

/**
 * Escucha el evento global `portal:session-expired` que dispara `apiFetch`
 * cuando una petición autenticada recibe 401. Muestra un modal claro
 * indicando que la sesión ha caducado y un botón para ir al login que
 * preserva la ruta actual como `callbackUrl` para volver justo donde
 * estaba el usuario al iniciar sesión de nuevo.
 *
 * Se monta una sola vez en el layout del portal.
 */
export function SessionExpiredModal() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const handler = () => setShown(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  if (!shown) return null;

  function goToLogin() {
    const callback =
      typeof window !== "undefined" ? window.location.pathname : "/";
    // Forzamos navegación completa (no router.push) para que NextAuth
    // limpie cualquier estado en memoria y cargue el login fresh.
    window.location.href = `/login?callbackUrl=${encodeURIComponent(callback)}`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-md bg-amber-100 text-amber-700 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="session-expired-title"
              className="text-base font-semibold text-gray-900"
            >
              Tu sesión ha expirado
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Por seguridad, las sesiones caducan tras 24 horas de inactividad.
              Vuelve a iniciar sesión para continuar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={goToLogin}
          className="w-full py-2.5 bg-[#275d6b] text-white text-sm font-medium rounded-lg hover:bg-[#1f4e5b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:ring-offset-2 transition-colors"
        >
          Volver a iniciar sesión
        </button>
      </div>
    </div>
  );
}
