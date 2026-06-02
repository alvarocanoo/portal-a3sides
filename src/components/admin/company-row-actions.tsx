"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditCompanyForm } from "./edit-company-form";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

interface Company {
  id: string;
  name: string;
  taxId: string | null;
  irecursosClientId: string | null;
  isActive: boolean;
}

interface Props {
  company: Company;
}

export function CompanyRowActions({ company }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleActive() {
    const verb = company.isActive ? "Desactivar" : "Reactivar";
    if (
      !window.confirm(
        `¿${verb} la empresa "${company.name}"?\n\n` +
          (company.isActive
            ? "Los usuarios y datos de la empresa se conservan, pero quedará marcada como inactiva."
            : "La empresa volverá a aparecer como activa.")
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Error al actualizar la empresa");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2 justify-end items-center">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={busy}
          className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={busy}
          className={cn(
            "px-2 py-1 text-xs rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            company.isActive
              ? "text-red-700 border-red-200 hover:bg-red-50"
              : "text-green-700 border-green-200 hover:bg-green-50"
          )}
        >
          {company.isActive ? "Desactivar" : "Reactivar"}
        </button>
      </div>

      {editOpen && (
        <EditCompanyForm
          company={company}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
