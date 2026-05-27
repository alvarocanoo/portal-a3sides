"use client";

import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";

interface HeaderProps {
  user: {
    name: string;
    email: string;
    role: Role;
  };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="h-[72px] bg-white border-b border-gray-200 flex items-center justify-end px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-gray-900">{user.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
