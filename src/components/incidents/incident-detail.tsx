"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { MessageSquare, Lock, Paperclip, ArrowLeft, AlertCircle, Clock, CheckCircle2, Hourglass } from "lucide-react";
import Link from "next/link";
import {
  statusLabelFor,
  statusClassFor,
  VALID_TRANSITIONS,
} from "@/lib/incident-states";
import { PRIORITY_CONFIG, ROLE_LABELS, formatDateTime, formatDuration } from "@/lib/constants";
import { FileUploader, type PendingFile } from "@/components/incidents/file-uploader";
import { ImageLightbox } from "@/components/incidents/image-lightbox";
import { uploadAttachment } from "@/lib/upload";
import { apiFetch } from "@/lib/api-fetch";
import { isImageMime } from "@/lib/storage/mime-types";

interface IncidentDetailProps {
  incident: {
    id: string;
    reference: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    category: string | null;
    createdAt: Date;
    // Tiempos para los chips de SLA (solo se muestran a AGENT/ADMIN).
    // getById ya los devuelve (Prisma findUnique con include sin select).
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    company: { id: string; name: string };
    createdBy: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    assignedTo: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    messages: {
      id: string;
      content: string;
      isInternal: boolean;
      createdAt: Date;
      author: {
        id: string;
        firstName: string;
        lastName: string;
        role: Role;
      };
      attachments: { id: string; fileName: string; fileSize: number; mimeType: string }[];
    }[];
    attachments: { id: string; fileName: string; fileSize: number; mimeType: string }[];
    statusChanges: {
      id: string;
      fromStatus: string;
      toStatus: string;
      reason: string | null;
      createdAt: Date;
      changedBy: { firstName: string; lastName: string };
    }[];
  };
  currentUser: {
    id: string;
    role: Role;
    companyId: string | null;
  };
  /** Lista de AGENT/ADMIN activos para el selector de reasignación.
   *  Vacía para CLIENT (no se le permite reasignar). */
  assignableUsers: {
    id: string;
    firstName: string;
    lastName: string;
    role: Role;
  }[];
}

// ── Helpers de transición ────────────────────────────────────────────────
// Mapean (from, to) → label visible y estilo del botón. La UI ya no decide
// QUÉ transiciones existen — eso lo dicta VALID_TRANSITIONS (fuente única
// de verdad en src/lib/incident-states.ts). Aquí solo se decide cómo se
// renderiza cada transición permitida.
const TRANSITION_BUTTON_STYLE: Record<string, string> = {
  IN_PROGRESS: "bg-[#275d6b] hover:bg-[#1f4e5b] text-white",
  WAITING_CLIENT: "bg-yellow-500 hover:bg-yellow-600 text-white",
  WAITING_THIRD_PARTY: "bg-purple-500 hover:bg-purple-600 text-white",
  RESOLVED: "bg-green-600 hover:bg-green-700 text-white",
  CLOSED: "bg-gray-600 hover:bg-gray-700 text-white",
};

function transitionLabel(from: string, to: string): string {
  // Etiquetas contextuales según el estado origen
  if (from === "OPEN" && to === "IN_PROGRESS") return "Tomar incidencia";
  if (from === "RESOLVED" && to === "IN_PROGRESS") return "Reabrir";
  if (from === "RESOLVED" && to === "CLOSED") return "Confirmar y cerrar";
  // Etiquetas por defecto según el estado destino
  if (to === "IN_PROGRESS") return "Retomar";
  if (to === "WAITING_CLIENT") return "Esperando cliente";
  if (to === "WAITING_THIRD_PARTY") return "Escalar a tercero";
  if (to === "RESOLVED") return "Marcar resuelta";
  if (to === "CLOSED") return "Cerrar incidencia";
  return to;
}

function transitionButtonStyle(from: string, to: string): string {
  // "Reabrir" (RESOLVED → IN_PROGRESS) lleva color propio (naranja) para no
  // confundirse visualmente con "Tomar" / "Retomar" (teal).
  if (from === "RESOLVED" && to === "IN_PROGRESS") {
    return "bg-orange-500 hover:bg-orange-600 text-white";
  }
  return TRANSITION_BUTTON_STYLE[to] ?? "bg-gray-500 hover:bg-gray-600 text-white";
}

// ── Renderizado de la lista de adjuntos ──────────────────────────────
// Para imágenes (allowlist en isImageMime) → miniatura clicable que abre
// el lightbox in-page. Para el resto (PDF, Word, Excel, txt, csv) →
// enlace de descarga clásico con icono Paperclip. Lo extraemos para
// reusarlo entre el bloque de adjuntos de la incidencia y el de los
// mensajes sin duplicar la lógica.
interface AttachmentLike {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

function AttachmentList({
  attachments,
  onPreview,
  className,
}: {
  attachments: AttachmentLike[];
  onPreview: (att: AttachmentLike) => void;
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {attachments.map((att) =>
        isImageMime(att.mimeType) ? (
          <button
            key={att.id}
            type="button"
            onClick={() => onPreview(att)}
            title={att.fileName}
            aria-label={`Vista previa de ${att.fileName}`}
            className="block h-20 w-20 rounded border border-gray-200 overflow-hidden hover:border-[#275d6b] focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 transition-colors"
          >
            <img
              src={`/api/attachments/${att.id}`}
              alt={att.fileName}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <a
            key={att.id}
            href={`/api/attachments/${att.id}`}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#275d6b] bg-[#275d6b]/5 rounded hover:bg-[#275d6b]/10"
          >
            <Paperclip className="h-3 w-3" />
            {att.fileName}
          </a>
        )
      )}
    </div>
  );
}

export function IncidentDetail({
  incident,
  currentUser,
  assignableUsers,
}: IncidentDetailProps) {
  const router = useRouter();
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [msgAttachments, setMsgAttachments] = useState<PendingFile[]>([]);
  const [msgUploadingIdx, setMsgUploadingIdx] = useState<number | null>(null);
  const [msgUploadProgress, setMsgUploadProgress] = useState(0);
  // ── Lightbox para previsualizar imágenes adjuntas ───────────────────
  // null cuando está cerrado. Cuando hay un objeto, ImageLightbox monta y
  // bloquea el scroll del body. Mismo state vale para los dos bloques de
  // adjuntos (incidencia y mensajes) — solo hay un lightbox a la vez.
  const [lightbox, setLightbox] = useState<AttachmentLike | null>(null);
  // ── Feedback al usuario ─────────────────────────────────────────────
  // actionError → banner rojo (algo falló: status change, send message...)
  // uploadWarnings → banner ámbar (acción ok pero algún adjunto no subió;
  //   se reutiliza para la creación (vía sessionStorage) y para el envío
  //   de mensajes, con copy contextual según el `context`).
  // ────────────────────────────────────────────────────────────────────
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<{
    context: "creation" | "message";
    items: string[];
  } | null>(null);

  // Recoge warnings de subida de adjuntos generadas en el formulario
  // de creacion (cuando la incidencia se creo pero algun adjunto fallo)
  useEffect(() => {
    const key = `upload-warnings-${incident.id}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const warnings = JSON.parse(raw) as string[];
        if (Array.isArray(warnings) && warnings.length > 0) {
          setUploadWarnings({ context: "creation", items: warnings });
        }
      } catch {
        // ignorar JSON invalido
      }
      sessionStorage.removeItem(key);
    }
  }, [incident.id]);

  const status = {
    label: statusLabelFor(currentUser.role, incident.status),
    className: statusClassFor(currentUser.role, incident.status),
  };
  const isClosed = incident.status === "CLOSED";

  // Transiciones permitidas desde el estado actual filtradas por el rol del
  // usuario. CLOSED y cualquier estado sin transiciones aplicables al rol
  // dejan la lista vacía → el bloque de botones simplemente no se pinta.
  const availableTransitions = (
    VALID_TRANSITIONS[incident.status as keyof typeof VALID_TRANSITIONS] ?? []
  ).filter((t) => t.roles.includes(currentUser.role as never));

  // ── Quién puede reasignar la incidencia ──────────────────────────
  // ADMIN: siempre (distribuye trabajo).
  // AGENT: solo si la incidencia no tiene asignado actual, o si él mismo
  //        es el asignado actual (puede cederla a otro). Misma regla
  //        que aplica el servicio en backend.
  // CLIENT: nunca.
  const canReassign =
    currentUser.role === "ADMIN" ||
    (currentUser.role === "AGENT" &&
      (!incident.assignedTo || incident.assignedTo.id === currentUser.id));
  const [assignLoading, setAssignLoading] = useState(false);

  // ── Cambio de prioridad (triaje) ────────────────────────────────────
  // SOLO AGENT/ADMIN. CLIENT ve la prioridad como texto pero no la cambia.
  // El servidor revalida el rol; aquí solo controlamos qué se pinta.
  const canChangePriority = currentUser.role !== "CLIENT";
  const [priorityLoading, setPriorityLoading] = useState(false);

  async function handleChangePriority(newPriority: string) {
    if (newPriority === incident.priority) return;
    setActionError(null);
    setPriorityLoading(true);
    try {
      const res = await apiFetch(`/api/incidents/${incident.id}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(
          data?.error || "No se pudo cambiar la prioridad. Inténtalo de nuevo."
        );
      }
    } catch {
      setActionError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setPriorityLoading(false);
    }
  }

  async function handleReassign(newAssigneeId: string) {
    if (newAssigneeId === (incident.assignedTo?.id ?? "")) return;
    const newAssignee = assignableUsers.find((u) => u.id === newAssigneeId);
    if (!newAssignee) return;

    const confirmed = window.confirm(
      `¿Reasignar la incidencia a ${newAssignee.firstName} ${newAssignee.lastName}?`
    );
    if (!confirmed) return;

    setActionError(null);
    setAssignLoading(true);
    try {
      const res = await apiFetch(`/api/incidents/${incident.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: newAssigneeId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(
          data?.error || "No se pudo reasignar la incidencia. Inténtalo de nuevo."
        );
      }
    } catch {
      setActionError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (msgAttachments.some((a) => a.error)) return;
    setActionError(null);
    setSending(true);

    try {
      const res = await apiFetch(`/api/incidents/${incident.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage, isInternal }),
      });

      if (!res.ok) {
        // Antes esto era un `return` silencioso. Ahora el usuario ve qué pasó.
        const data = await res.json().catch(() => ({}));
        setActionError(
          data?.error ||
            "No se pudo enviar el mensaje. Inténtalo de nuevo."
        );
        return;
      }

      const message = await res.json();

      // Subir adjuntos del mensaje uno por uno con progreso. Antes los
      // fallos se ignoraban; ahora los recogemos y avisamos al usuario.
      const failedUploads: string[] = [];
      for (let i = 0; i < msgAttachments.length; i++) {
        setMsgUploadingIdx(i);
        setMsgUploadProgress(0);
        const result = await uploadAttachment({
          file: msgAttachments[i].file,
          messageId: message.id,
          onProgress: (p) => setMsgUploadProgress(p.percent),
        });
        if (!result.ok) {
          failedUploads.push(
            `${msgAttachments[i].file.name}: ${result.error}`
          );
        }
      }
      setMsgUploadingIdx(null);

      if (failedUploads.length > 0) {
        setUploadWarnings({ context: "message", items: failedUploads });
      }

      setNewMessage("");
      setIsInternal(false);
      setMsgAttachments([]);
      router.refresh();
    } catch {
      setActionError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setSending(false);
      setMsgUploadingIdx(null);
    }
  }

  async function handleStatusChange(newStatus: string) {
    // "Tomar incidencia" sobre una ya asignada a OTRO agente: pedir confirmacion.
    // El caso normal (OPEN sin asignar) no preguntara nada.
    if (
      newStatus === "IN_PROGRESS" &&
      incident.status === "OPEN" &&
      incident.assignedTo &&
      incident.assignedTo.id !== currentUser.id
    ) {
      const name = `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`;
      const confirmed = window.confirm(
        `Esta incidencia está asignada a ${name}. Tomarla te la asignará a ti. ¿Continuar?`
      );
      if (!confirmed) return;
    }

    setActionError(null);
    setStatusLoading(true);
    try {
      const res = await apiFetch(`/api/incidents/${incident.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        // Antes el fallo era silencioso. Ahora el usuario ve el motivo
        // (sesión expirada, transición inválida, permisos, etc.).
        const data = await res.json().catch(() => ({}));
        setActionError(
          data?.error ||
            "No se pudo cambiar el estado. Inténtalo de nuevo."
        );
      }
    } catch {
      setActionError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setStatusLoading(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/incidencias"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a incidencias
      </Link>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm flex-1 text-red-700">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {uploadWarnings && uploadWarnings.items.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="text-amber-800 font-medium">
              {uploadWarnings.context === "creation"
                ? "La incidencia se creó, pero algunos adjuntos fallaron:"
                : "El mensaje se envió, pero algunos adjuntos no se pudieron adjuntar:"}
            </p>
            <ul className="mt-1 text-amber-700 text-xs space-y-0.5 list-disc list-inside">
              {uploadWarnings.items.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-700">
              Puedes intentar adjuntarlos de nuevo desde el formulario de mensaje.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUploadWarnings(null)}
            className="text-amber-600 hover:text-amber-800"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-mono text-gray-500 mb-1">
              {incident.reference}
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              {incident.subject}
            </h1>
          </div>
          <span
            className={cn(
              "shrink-0 px-3 py-1 text-sm font-medium rounded-full",
              status.className
            )}
          >
            {status.label}
          </span>
        </div>

        <div
          className={cn(
            "mt-4 grid gap-4 text-sm",
            // CLIENT no ve Prioridad → 3 columnas (Categoría, Creado por,
            // Asignado a). AGENT/ADMIN ven las 4 originales.
            canChangePriority
              ? "grid-cols-2 sm:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-3"
          )}
        >
          {/* Bloque "Prioridad": SOLO AGENT/ADMIN. CLIENT no ve ni la
              etiqueta. canChangePriority ya es (role !== "CLIENT"). */}
          {canChangePriority && (
            <div>
              <p className="text-gray-500">Prioridad</p>
              <select
                value={incident.priority}
                onChange={(e) => handleChangePriority(e.target.value)}
                disabled={priorityLoading}
                aria-label="Cambiar prioridad"
                className={cn(
                  "mt-0.5 w-full text-sm bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] disabled:opacity-50 disabled:cursor-wait",
                  PRIORITY_CONFIG[incident.priority as keyof typeof PRIORITY_CONFIG]?.className
                )}
              >
                {(Object.keys(PRIORITY_CONFIG) as Array<keyof typeof PRIORITY_CONFIG>).map((k) => (
                  <option key={k} value={k}>
                    {PRIORITY_CONFIG[k].label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <p className="text-gray-500">Categoría</p>
            <p className="font-medium">{incident.category || "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Creado por</p>
            <p className="font-medium">
              {incident.createdBy.firstName} {incident.createdBy.lastName}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Asignado a</p>
            {canReassign ? (
              <select
                value={incident.assignedTo?.id ?? ""}
                onChange={(e) => handleReassign(e.target.value)}
                disabled={assignLoading}
                aria-label="Reasignar incidencia"
                className="mt-0.5 w-full text-sm font-medium bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] disabled:opacity-50 disabled:cursor-wait"
              >
                <option value="" disabled>
                  Sin asignar
                </option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                    {u.role === "ADMIN" ? " (Admin)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">
                {incident.assignedTo
                  ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
                  : "Sin asignar"}
              </p>
            )}
          </div>
        </div>

        {currentUser.role !== "CLIENT" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <p className="text-gray-500 text-sm">Empresa:</p>
            <p className="text-sm font-medium">{incident.company.name}</p>
          </div>
        )}

        {/* Chips de SLA — SOLO AGENT/ADMIN. El CLIENT no ve métricas
            internas de tiempos (mismo criterio que con la prioridad).
            slaNow se calcula UNA sola vez al montar (useMemo) para
            evitar re-renders en bucle por cambios de Date.now(). Si el
            usuario quiere el reloj actualizado, refresca la página. */}
        {currentUser.role !== "CLIENT" && (
          <SlaChips
            createdAt={incident.createdAt}
            firstResponseAt={incident.firstResponseAt}
            resolvedAt={incident.resolvedAt}
            closedAt={incident.closedAt}
          />
        )}

        {/* Acciones de estado — generadas dinámicamente desde VALID_TRANSITIONS.
            Si availableTransitions es vacío (CLOSED, o rol sin transiciones
            posibles desde el estado actual), no se pinta el separador ni la
            sección, manteniendo el detalle limpio. */}
        {availableTransitions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            {availableTransitions.map((t) => (
              <button
                key={t.to}
                onClick={() => handleStatusChange(t.to)}
                disabled={statusLoading}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md disabled:opacity-50 transition-colors",
                  transitionButtonStyle(incident.status, t.to)
                )}
              >
                {transitionLabel(incident.status, t.to)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Descripción */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4 overflow-hidden">
        <h2 className="text-sm font-medium text-gray-500 mb-2">Descripción</h2>
        <p className="text-gray-900 whitespace-pre-wrap break-words">
          {incident.description}
        </p>
        <AttachmentList
          attachments={incident.attachments}
          onPreview={setLightbox}
          className="mt-3"
        />
      </div>

      {/* Mensajes */}
      <div className="space-y-3 mb-4">
        {incident.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "bg-white rounded-lg border p-4",
              msg.isInternal
                ? "border-amber-200 bg-amber-50"
                : "border-gray-200"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-900">
                {msg.author.firstName} {msg.author.lastName}
              </span>
              <span className="text-xs text-gray-400">
                {ROLE_LABELS[msg.author.role]}
              </span>
              {msg.isInternal && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  <Lock className="h-3 w-3" />
                  Nota interna
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {formatDateTime(msg.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {msg.content}
            </p>
            <AttachmentList
              attachments={msg.attachments}
              onPreview={setLightbox}
              className="mt-2"
            />
          </div>
        ))}
      </div>

      {/* Nuevo mensaje */}
      {!isClosed && (
        <form
          onSubmit={handleSendMessage}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Nuevo mensaje
            </span>
            {currentUser.role !== "CLIENT" && (
              <label className="ml-auto flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-gray-600">Nota interna</span>
              </label>
            )}
          </div>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            rows={3}
            required
            disabled={sending}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#275d6b]/40 focus:border-[#275d6b] text-sm disabled:opacity-60"
            placeholder="Escribe tu mensaje..."
          />

          <div className="mt-3">
            <FileUploader
              files={msgAttachments}
              onFilesChange={setMsgAttachments}
              disabled={sending}
            />
          </div>

          {msgUploadingIdx !== null && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span className="truncate pr-2">
                  Subiendo {msgUploadingIdx + 1}/{msgAttachments.length}:{" "}
                  {msgAttachments[msgUploadingIdx]?.file.name}
                </span>
                <span className="font-mono">{msgUploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#275d6b] transition-all"
                  style={{ width: `${msgUploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={
                sending ||
                !newMessage.trim() ||
                msgAttachments.some((a) => a.error)
              }
              className="px-4 py-2 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending
                ? msgUploadingIdx !== null
                  ? "Subiendo archivos..."
                  : "Enviando..."
                : "Enviar"}
            </button>
          </div>
        </form>
      )}

      {/* Lightbox de previsualización de imágenes. Se monta solo cuando
          hay un attachment seleccionado. La seguridad la da el endpoint
          /api/attachments/[id] (mismo path que la descarga); este
          componente solo decide qué se renderiza, no qué se sirve. */}
      {lightbox && (
        <ImageLightbox
          src={`/api/attachments/${lightbox.id}`}
          alt={lightbox.fileName}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ── Chips de SLA (interno, no exportado) ────────────────────────────
// Renderiza tres indicadores compactos en el header del detalle. Lógica:
//   - 1ª respuesta: si firstResponseAt → verde. Si null → ámbar (gris si
//     lleva poco abierta, ámbar si lleva >24h sin respuesta).
//   - Resolución: si resolvedAt → verde. Si closedAt sin resolvedAt → gris
//     (cerrada sin pasar por resolución). Si nada → no se muestra.
//   - Abierta: si NO está cerrada ni resuelta, muestra cuánto lleva. Si
//     supera 24h sin 1ª respuesta, se resalta en ámbar como aviso SLA.
//
// `now` se calcula UNA vez con useMemo([]) — no se actualiza cada
// segundo. Refrescar la página renueva el cálculo. Esto evita cualquier
// posibilidad de re-render en bucle por Date.now().
const UMBRAL_ALERTA_MS = 24 * 60 * 60 * 1000; // 24h

function SlaChips({
  createdAt,
  firstResponseAt,
  resolvedAt,
  closedAt,
}: {
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
}) {
  const now = useMemo(() => Date.now(), []);
  const createdMs = new Date(createdAt).getTime();
  const elapsedOpenMs = now - createdMs;
  const isClosedOrResolved = resolvedAt !== null || closedAt !== null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400 uppercase tracking-wider mr-1">SLA</span>

      {/* Chip 1: tiempo hasta primera respuesta */}
      {firstResponseAt ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border",
            "bg-emerald-50 text-emerald-700 border-emerald-200"
          )}
        >
          <Clock className="h-3 w-3" />
          1ª respuesta en {formatDuration(createdAt, firstResponseAt)}
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border",
            elapsedOpenMs > UMBRAL_ALERTA_MS
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-gray-50 text-gray-600 border-gray-200"
          )}
        >
          <Clock className="h-3 w-3" />
          Pendiente de 1ª respuesta
        </span>
      )}

      {/* Chip 2: tiempo de resolución (solo si resolvedAt). Si solo hay
          closedAt sin resolvedAt, lo mostramos como "Cerrada en X". */}
      {resolvedAt ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Resuelta en {formatDuration(createdAt, resolvedAt)}
        </span>
      ) : closedAt ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border bg-gray-50 text-gray-600 border-gray-200">
          <CheckCircle2 className="h-3 w-3" />
          Cerrada en {formatDuration(createdAt, closedAt)}
        </span>
      ) : null}

      {/* Chip 3: tiempo abierta — solo si NO está resuelta ni cerrada.
          Si supera 24h sin 1ª respuesta, en ámbar. */}
      {!isClosedOrResolved && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border",
            elapsedOpenMs > UMBRAL_ALERTA_MS && !firstResponseAt
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-gray-50 text-gray-600 border-gray-200"
          )}
        >
          <Hourglass className="h-3 w-3" />
          Abierta {formatDuration(elapsedOpenMs)}
        </span>
      )}
    </div>
  );
}
