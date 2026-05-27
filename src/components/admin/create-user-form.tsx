"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Copy, Check } from "lucide-react";

interface Props {
  companies: { id: string; name: string }[];
}

export function CreateUserForm({ companies }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"CLIENT" | "AGENT" | "ADMIN">("CLIENT");
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          role,
          companyId: role === "CLIENT" ? companyId : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear el usuario");
        return;
      }

      const data = await res.json();
      setCreatedUser({
        email: data.user.email,
        tempPassword: data.tempPassword,
      });
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setCreatedUser(null);
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("CLIENT");
    setCompanyId("");
    setError("");
    setCopied(false);
    router.refresh();
  }

  async function handleCopy() {
    if (!createdUser) return;
    await navigator.clipboard.writeText(
      `Email: ${createdUser.email}\nContraseña temporal: ${createdUser.tempPassword}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-4 py-2 bg-[#275d6b] text-white text-sm font-medium rounded-md hover:bg-[#1f4e5b] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nuevo usuario
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {createdUser ? "Usuario creado" : "Nuevo usuario"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {createdUser ? (
          <div className="p-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
              <p className="text-sm text-green-800 font-medium mb-2">
                Usuario creado correctamente
              </p>
              <div className="text-sm text-green-700 space-y-1">
                <p>
                  Email: <strong>{createdUser.email}</strong>
                </p>
                <p>
                  Contraseña temporal:{" "}
                  <strong className="font-mono">
                    {createdUser.tempPassword}
                  </strong>
                </p>
              </div>
              <p className="text-xs text-green-600 mt-2">
                El usuario deberá cambiar la contraseña en su primer acceso.
              </p>
            </div>
            <div className="flex justify-end gap-2">
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
              <button
                onClick={handleClose}
                className="px-3 py-2 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b]"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apellidos *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rol *
              </label>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "CLIENT" | "AGENT" | "ADMIN")
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
              >
                <option value="CLIENT">Cliente</option>
                <option value="AGENT">Agente</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>

            {role === "CLIENT" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa *
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40"
                >
                  <option value="">Seleccionar empresa...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b] disabled:opacity-50"
              >
                {loading ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
