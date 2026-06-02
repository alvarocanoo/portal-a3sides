"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { PASSWORD_POLICY, validatePassword } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * true → usuario en primer acceso (no se pide contraseña actual; ya
   *        autenticó con la temporal para llegar aquí).
   * false → cambio voluntario; se pide y verifica la contraseña actual.
   */
  mustChangePassword: boolean;
}

export function CambiarPasswordForm({ mustChangePassword }: Props) {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Estado precomputado de la política (para feedback visible y para
  // bloquear el submit si no se cumple).
  const policyResult = validatePassword(password);
  const policyMet = policyResult.valid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!policyMet) {
      setError(
        "La contraseña no cumple los requisitos: " +
          policyResult.failed.join("; ")
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (!mustChangePassword && !oldPassword) {
      setError("Debes introducir tu contraseña actual");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          ...(mustChangePassword ? {} : { oldPassword }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al cambiar la contraseña");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Encabezado discreto del form — mismo patrón que /login. */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
          {mustChangePassword
            ? "Establece tu contraseña"
            : "Cambiar contraseña"}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {mustChangePassword
            ? "Debes establecer una nueva contraseña para continuar."
            : "Introduce tu contraseña actual y la nueva."}
        </p>
      </div>

      {/* Ritmo del formulario idéntico al de /login:
            space-y-4 (16px) entre hijos directos
            mb-1.5 (6px) label → input
            pt-2 (8px) wrapper del botón = 24px del último campo
      */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {!mustChangePassword && (
          <div>
            <label
              htmlFor="oldPassword"
              className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide"
            >
              Contraseña actual
            </label>
            <input
              id="oldPassword"
              type="password"
              required
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide"
          >
            Nueva contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={PASSWORD_POLICY.minLength}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-requirements"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
          />
          {/* Lista de requisitos. Cada item se pinta en verde cuando se
              cumple (check) o gris cuando no (X). Se actualiza en vivo
              mientras el usuario escribe. */}
          <ul
            id="password-requirements"
            className="mt-2 space-y-1"
            aria-live="polite"
          >
            {PASSWORD_POLICY.requirements.map((req) => {
              // En password vacío mostramos todo en gris (estado neutro),
              // no en rojo — no queremos dar feedback negativo antes de
              // que el usuario haya empezado a escribir.
              const fresh = password.length === 0;
              const ok = !fresh && req.check(password);
              return (
                <li
                  key={req.id}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    ok
                      ? "text-green-700"
                      : fresh
                        ? "text-gray-500"
                        : "text-gray-500"
                  )}
                >
                  {ok ? (
                    <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  ) : (
                    <X
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        fresh ? "text-gray-300" : "text-gray-400"
                      )}
                    />
                  )}
                  {req.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide"
          >
            Confirmar contraseña
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={PASSWORD_POLICY.minLength}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !policyMet}
            className="w-full py-2.5 bg-[#275d6b] text-white text-sm font-medium rounded-lg hover:bg-[#1f4e5b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Guardando..." : "Guardar nueva contraseña"}
          </button>
        </div>
      </form>
    </div>
  );
}
