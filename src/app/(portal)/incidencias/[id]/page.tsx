import { requireAuth } from "@/lib/auth/helpers";
import { IncidentService } from "@/services/incident.service";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { IncidentDetail } from "@/components/incidents/incident-detail";

export default async function IncidenciaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const incident = await IncidentService.getById(
    id,
    session.user.role,
    session.user.companyId
  );

  if (!incident) notFound();

  // Lista de agentes/admins activos para poder reasignar la incidencia.
  // Solo la cargamos para roles que pueden reasignar (no para CLIENT).
  // En el componente cliente se decidirá si el usuario actual tiene
  // permiso real (ADMIN siempre; AGENT solo sobre incidencias propias).
  const assignableUsers =
    session.user.role !== "CLIENT"
      ? await prisma.user.findMany({
          where: {
            role: { in: ["AGENT", "ADMIN"] },
            isActive: true,
          },
          select: { id: true, firstName: true, lastName: true, role: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        })
      : [];

  return (
    <IncidentDetail
      incident={incident}
      currentUser={{
        id: session.user.id,
        role: session.user.role,
        companyId: session.user.companyId,
      }}
      assignableUsers={assignableUsers}
    />
  );
}
