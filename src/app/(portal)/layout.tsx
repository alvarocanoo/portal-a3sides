import { requireAuth, requirePasswordChanged } from "@/lib/auth/helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  if (session.user.mustChangePassword) {
    const { redirect } = await import("next/navigation");
    redirect("/cambiar-password");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar role={session.user.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={session.user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
