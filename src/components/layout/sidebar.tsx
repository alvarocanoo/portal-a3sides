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
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo-small.svg"
            alt="a3sides"
            width={100}
            height={24}
            priority
          />
          <span className="text-xs font-medium text-gray-400 border-l border-gray-200 pl-2">
            Soporte
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
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
                  ? "bg-[#275d6b]/10 text-[#275d6b]"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-300 uppercase tracking-wider">
          Software Solutions
        </p>
      </div>
    </aside>
  );
}
