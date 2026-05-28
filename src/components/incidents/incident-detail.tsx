"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { MessageSquare, Lock, Paperclip, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { statusLabel, statusClass } from "@/lib/incident-states";
import { priorityLabel, ROLE_LABELS, formatDateTime } from "@/lib/constants";
import { FileUploader, type PendingFile } from "@/components/incidents/file-uploader";
import { uploadAttachment } from "@/lib/upload";

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
      attachments: { id: string; fileName: string; fileSize: number }[];
    }[];
    attachments: { id: string; fileName: string; fileSize: number }[];
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
}

export function IncidentDetail({ incident, currentUser }: IncidentDetailProps) {
  const router = useRouter();
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [msgAttachments, setMsgAttachments] = useState<PendingFile[]>([]);
  const [msgUploadingIdx, setMsgUploadingIdx] = useState<number | null>(null);
  const [msgUploadProgress, setMsgUploadProgress] = useState(0);
  const [creationWarnings, setCreationWarnings] = useState<string[]>([]);

  // Recoge warnings de subida de adjuntos generadas en el formulario
  // de creacion (cuando la incidencia se creo pero algun adjunto fallo)
  useEffect(() => {
    const key = `upload-warnings-${incident.id}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const warnings = JSON.parse(raw) as string[];
        if (Array.isArray(warnings) && warnings.length > 0) {
          setCreationWarnings(warnings);
        }
      } catch {
        // ignorar JSON invalido
      }
      sessionStorage.removeItem(key);
    }
  }, [incident.id]);

  const status = { label: statusLabel(incident.status), className: statusClass(incident.status) };
  const isClosed = incident.status === "CLOSED";

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (msgAttachments.some((a) => a.error)) return;
    setSending(true);

    try {
      const res = await fetch(`/api/incidents/${incident.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage, isInternal }),
      });

      if (!res.ok) return;

      const message = await res.json();

      // Subir adjuntos del mensaje uno por uno con progreso
      for (let i = 0; i < msgAttachments.length; i++) {
        setMsgUploadingIdx(i);
        setMsgUploadProgress(0);
        await uploadAttachment({
          file: msgAttachments[i].file,
          messageId: message.id,
          onProgress: (p) => setMsgUploadProgress(p.percent),
        });
      }
      setMsgUploadingIdx(null);

      setNewMessage("");
      setIsInternal(false);
      setMsgAttachments([]);
      router.refresh();
    } finally {
      setSending(false);
      setMsgUploadingIdx(null);
    }
  }

  async function handleStatusChange(newStatus: string) {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) router.refresh();
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

      {creationWarnings.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="text-amber-800 font-medium">
              La incidencia se creó, pero algunos adjuntos fallaron:
            </p>
            <ul className="mt-1 text-amber-700 text-xs space-y-0.5 list-disc list-inside">
              {creationWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-700">
              Puedes intentar adjuntarlos de nuevo desde el formulario de mensaje.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreationWarnings([])}
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

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Prioridad</p>
            <p className="font-medium">
              {priorityLabel(incident.priority)}
            </p>
          </div>
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
            <p className="font-medium">
              {incident.assignedTo
                ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
                : "Sin asignar"}
            </p>
          </div>
        </div>

        {currentUser.role !== "CLIENT" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <p className="text-gray-500 text-sm">Empresa:</p>
            <p className="text-sm font-medium">{incident.company.name}</p>
          </div>
        )}

        {/* Acciones de estado */}
        {!isClosed && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            {incident.status === "OPEN" &&
              currentUser.role !== "CLIENT" && (
                <button
                  onClick={() => handleStatusChange("IN_PROGRESS")}
                  disabled={statusLoading}
                  className="px-3 py-1.5 text-sm bg-[#275d6b] text-white rounded-md hover:bg-[#1f4e5b] disabled:opacity-50"
                >
                  Tomar incidencia
                </button>
              )}
            {incident.status === "IN_PROGRESS" &&
              currentUser.role !== "CLIENT" && (
                <>
                  <button
                    onClick={() => handleStatusChange("WAITING_CLIENT")}
                    disabled={statusLoading}
                    className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
                  >
                    Esperando cliente
                  </button>
                  <button
                    onClick={() => handleStatusChange("WAITING_THIRD_PARTY")}
                    disabled={statusLoading}
                    className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                  >
                    Escalar a tercero
                  </button>
                  <button
                    onClick={() => handleStatusChange("RESOLVED")}
                    disabled={statusLoading}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Marcar resuelta
                  </button>
                </>
              )}
            {incident.status === "RESOLVED" && (
              <>
                <button
                  onClick={() => handleStatusChange("CLOSED")}
                  disabled={statusLoading}
                  className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  Confirmar y cerrar
                </button>
                <button
                  onClick={() => handleStatusChange("IN_PROGRESS")}
                  disabled={statusLoading}
                  className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  Reabrir
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Descripción */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4 overflow-hidden">
        <h2 className="text-sm font-medium text-gray-500 mb-2">Descripción</h2>
        <p className="text-gray-900 whitespace-pre-wrap break-words">
          {incident.description}
        </p>
        {incident.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {incident.attachments.map((att) => (
              <a
                key={att.id}
                href={`/api/attachments/${att.id}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#275d6b] bg-[#275d6b]/5 rounded hover:bg-[#275d6b]/10"
              >
                <Paperclip className="h-3 w-3" />
                {att.fileName}
              </a>
            ))}
          </div>
        )}
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
            {msg.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {msg.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/attachments/${att.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#275d6b] bg-[#275d6b]/5 rounded hover:bg-[#275d6b]/10"
                  >
                    <Paperclip className="h-3 w-3" />
                    {att.fileName}
                  </a>
                ))}
              </div>
            )}
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
    </div>
  );
}
