"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
  /** true si el usuario de la fila es el propio admin que está navegando */
  isSelf: boolean;
}

export function UserRowActions({ user, isSelf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{
    emailSent: boolean;
    tempPassword: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleToggleActive() {
    const verb = user.isActive ? "Desactivar" : "Reactivar";
    if (
      !window.confirm(
        `¿${verb} a ${user.firstName} ${user.lastName}?\n\n` +
          (user.isActive
            ? "El usuario no podrá iniciar sesión hasta que se le reactive."
            : "El usuario podrá volver a iniciar sesión.")
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Error al actualizar el usuario");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    if (
      !window.confirm(
        `¿Resetear la contraseña de ${user.firstName} ${user.lastName}?\n\n` +
          "Se generará una nueva contraseña temporal y se enviará por email. " +
          "El usuario tendrá que cambiarla en su próximo acceso."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setResetResult({
          emailSent: data.emailSent,
          tempPassword: data.tempPassword ?? null,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Error al resetear la contraseña");
      }
    } finally {
      setBusy(false);
    }
  }

  function closeResult() {
    setResetResult(null);
    setCopied(false);
    router.refresh();
  }

  async function handleCopy() {
    if (!resetResult?.tempPassword) return;
    await navigator.clipboard.writeText(
      `Email: ${user.email}\nContraseña temporal: ${resetResult.tempPassword}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const cannotDeactivate = isSelf && user.isActive;

  return (
    <>
      <div className="flex gap-2 justify-end items-center">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={busy || cannotDeactivate}
          title={
            cannotDeactivate ? "No puedes desactivarte a ti mismo" : undefined
          }
          className={cn(
            "px-2 py-1 text-xs rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            user.isActive
              ? "text-red-700 border-red-200 hover:bg-red-50"
              : "text-green-700 border-green-200 hover:bg-green-50"
          )}
        >
          {user.isActive ? "Desactivar" : "Reactivar"}
        </button>
        <button
          type="button"
          onClick={handleResetPassword}
          disabled={busy || !user.isActive}
          title={
            !user.isActive
              ? "El usuario está desactivado — reactívalo antes de resetear"
              : undefined
          }
          className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Resetear contraseña
        </button>
      </div>

      {resetResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Contraseña restablecida</h2>
              <button
                onClick={closeResult}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {resetResult.emailSent ? (
                <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-green-800 font-medium mb-2">
                    Email enviado
                  </p>
                  <p className="text-sm text-green-700">
                    Se ha enviado la nueva contraseña temporal a{" "}
                    <strong>{user.email}</strong>. El usuario tendrá que
                    cambiarla en su próximo acceso.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-amber-800 font-medium mb-2">
                    Contraseña restablecida pero el email no pudo enviarse
                  </p>
                  <div className="text-sm text-amber-700 space-y-1">
                    <p>
                      Email: <strong>{user.email}</strong>
                    </p>
                    <p>
                      Contraseña temporal:{" "}
                      <strong className="font-mono">
                        {resetResult.tempPassword}
                      </strong>
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    Comunícale estas credenciales por un canal seguro. El
                    usuario tendrá que cambiarla en su próximo acceso.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                {resetResult.tempPassword && (
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copiado" : "Copiar credenciales"}
                  </button>
                )}
                <button
                  onClick={closeResult}
                  className="px-3 py-2 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
