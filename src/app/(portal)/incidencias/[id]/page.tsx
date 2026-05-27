import { requireAuth } from "@/lib/auth/helpers";
import { IncidentService } from "@/services/incident.service";
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

  return (
    <IncidentDetail
      incident={incident}
      currentUser={{
        id: session.user.id,
        role: session.user.role,
        companyId: session.user.companyId,
      }}
    />
  );
}
