import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/api";
import { IncidentService } from "@/services/incident.service";
import { AuditService } from "@/services/audit.service";
import { getRequestContext } from "@/lib/request-context";
import { updateIncidentPrioritySchema } from "@/lib/validators/incident";

/**
 * Cambia la prioridad de una incidencia. SOLO AGENT/ADMIN.
 *
 * Tres capas de seguridad coordinadas (defensa en profundidad):
 *   A) El validator `createIncidentSchema` ya no acepta `priority` en
 *      creación: ese campo se ignora si llega en el body del POST.
 *   B) Este endpoint rechaza CLIENT con 403 antes de cualquier lectura.
 *   C) `IncidentService.changePriority` repite el check de rol en el
 *      servicio: si un futuro endpoint olvidara el guard, sigue protegido.
 *
 * No-op silencioso si la prioridad pedida coincide con la actual:
 * devolvemos 200 con la incidencia sin tocar BD ni emitir audit log
 * (evita ruido cuando el `<select>` dispara onChange con el valor que
 * ya estaba).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await authorizeApi({ roles: ["AGENT", "ADMIN"] });
    if (!authz.ok) return authz.response;
    const { session } = authz;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateIncidentPrioritySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await IncidentService.changePriority(
      id,
      parsed.data.priority,
      session.user.role
    );

    if (result.changed) {
      const { ipAddress, userAgent } = getRequestContext(request);
      await AuditService.log({
        action: "incident.priority.change",
        userId: session.user.id,
        entityType: "Incident",
        entityId: id,
        metadata: {
          reference: result.incident.reference,
          fromPriority: result.fromPriority,
          toPriority: result.toPriority,
        },
        ipAddress,
        userAgent,
      });
    }

    return NextResponse.json(result.incident);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "No tienes permiso" },
          { status: 403 }
        );
      }
      if (error.message === "INCIDENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Incidencia no encontrada" },
          { status: 404 }
        );
      }
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
