"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Users,
  Building2,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["CLIENT", "AGENT", "ADMIN"],
  },
  {
    label: "Nueva incidencia",
    href: "/incidencias/nueva",
    icon: PlusCircle,
    roles: ["CLIENT"],
  },
  {
    label: "Incidencias",
    href: "/incidencias",
    icon: Ticket,
    roles: ["CLIENT", "AGENT", "ADMIN"],
  },
  {
    label: "Empresas",
    href: "/admin/empresas",
    icon: Building2,
    roles: ["ADMIN"],
  },
  {
    label: "Usuarios",
    href: "/admin/usuarios",
    icon: Users,
    roles: ["ADMIN"],
  },
  {
    label: "Audit Log",
    href: "/admin/audit",
    icon: ClipboardList,
    roles: ["ADMIN"],
  },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* ── Cabecera con logo ── */}
      <Link
        href="/dashboard"
        className="flex items-center h-16 px-4 border-b border-gray-200 shrink-0 group"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="shrink-0 overflow-hidden" style={{ height: 44 }}>
            <Image
              src="/logoa3sides.png"
              alt="a3sides Software Solutions"
              width={225}
              height={225}
              className="max-w-none"
              style={{
                width: 130,
                height: 130,
                marginTop: -38,
                marginBottom: -48,
              }}
              priority
              unoptimized
            />
          </div>
          <span className="h-4 w-px bg-gray-200 shrink-0" aria-hidden="true" />
          <span className="text-[10.5px] font-semibold tracking-[0.08em] text-gray-400 uppercase">
            Soporte
          </span>
        </div>
      </Link>

      {/* ── Navegacion ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
