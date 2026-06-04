"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ── Anti open-redirect (hallazgo C4 segunda auditoría) ─────────────
  // Aceptamos SOLO rutas internas. Una URL absoluta (https://evil.com)
  // o protocol-relative (//evil.com) en callbackUrl permitiría a un
  // atacante hacer phishing post-login: usuario entra al portal real,
  // pero tras autenticarse acaba en evil.com con un clon del dashboard
  // que captura su próximo input. Next 15 router.push acepta URLs
  // externas, así que la validación es nuestra.
  //
  // Regla: empieza por "/" pero NO por "//" → interno → respeta.
  //         Cualquier otra cosa → cae a "/dashboard".
  const rawCallback = searchParams.get("callbackUrl") || "/dashboard";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // ── Contador local de intentos fallidos en ESTA pestaña ──────────
  // SOLO estado de cliente. No revela el estado real del lockout (que
  // vive en BD por email); solo cuenta intentos del usuario aquí. Sirve
  // para mostrar un texto de ayuda secundario tras 3 fallos, orientando
  // al usuario legítimo que se autobloquea por error sin revelarle ni
  // a un atacante observador que la cuenta está bloqueada. Hallazgo
  // §2.2 de la segunda auditoría.
  const [failedAttempts, setFailedAttempts] = useState(0);
  const HELP_THRESHOLD = 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email o contraseña incorrectos");
        setFailedAttempts((n) => n + 1);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // Ritmo del formulario:
    //   space-y-4 (16px) entre hijos directos = error/email/password/button-wrapper
    //   mb-1.5 (6px) dentro de cada grupo: label -> input
    //   pt-2 (8px) en el wrapper del boton para sumar 24px desde el ultimo campo,
    //   destacando la accion principal sin romper la escala.
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Texto de ayuda secundario tras varios fallos en esta pestaña.
          POSIBILIDAD, no diagnóstico: el front NO sabe si la cuenta está
          bloqueada (eso sería revelar info a un atacante). Solo orienta
          al usuario legítimo que ha tecleado mal varias veces y luego
          duda si su pw es correcta. Gris pequeño, no banner rojo — se
          lee como "ayuda", no como otro error. */}
      {failedAttempts >= HELP_THRESHOLD && (
        <p className="text-xs text-gray-500 leading-relaxed">
          ¿Tu contraseña es correcta y aun así no entras? Por seguridad,
          tras varios intentos fallidos el acceso a una cuenta se bloquea
          temporalmente unos minutos. Espera un poco e inténtalo de nuevo,
          o contacta con tu administrador si el problema persiste.
        </p>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
          placeholder="tu@email.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide"
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] transition-shadow"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[#275d6b] text-white text-sm font-medium rounded-lg hover:bg-[#1f4e5b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Entrando..." : "Acceder"}
        </button>
      </div>
    </form>
  );
}
