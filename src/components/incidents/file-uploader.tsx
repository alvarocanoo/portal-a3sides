"use client";

import { useRef, useState, useCallback } from "react";
import { Paperclip, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

const ACCEPT_ATTR = ALLOWED_MIME_TYPES.join(",");

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PendingFile {
  file: File;
  id: string;
  error?: string;
}

interface FileUploaderProps {
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileUploader({
  files,
  onFilesChange,
  maxSizeMB = 10,
  disabled = false,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const validateAndAdd = useCallback(
    (newFiles: FileList | File[]) => {
      const additions: PendingFile[] = [];
      for (const file of Array.from(newFiles)) {
        let error: string | undefined;

        if (file.size === 0) {
          error = "El archivo está vacío";
        } else if (file.size > maxBytes) {
          error = `Supera el límite de ${maxSizeMB} MB`;
        } else if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          error = "Tipo de archivo no permitido";
        }

        additions.push({
          file,
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          error,
        });
      }
      onFilesChange([...files, ...additions]);
    },
    [files, onFilesChange, maxBytes, maxSizeMB]
  );

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) validateAndAdd(e.target.files);
    // Reset para permitir seleccionar el mismo archivo de nuevo si se quita
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files) validateAndAdd(e.dataTransfer.files);
  }

  function remove(id: string) {
    onFilesChange(files.filter((f) => f.id !== id));
  }

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-md px-4 py-5 text-center transition-colors",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer",
          isDragging
            ? "border-[#275d6b] bg-[#275d6b]/5"
            : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={handleSelect}
          disabled={disabled}
          className="hidden"
        />
        <Paperclip className="h-5 w-5 text-gray-400 mx-auto mb-1.5" />
        <p className="text-sm text-gray-600">
          <span className="text-[#275d6b] font-medium">Selecciona archivos</span>{" "}
          o arrástralos aquí
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Imágenes, PDF, Word, Excel, texto · máx. {maxSizeMB} MB cada uno
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((pf) => (
            <li
              key={pf.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                pf.error
                  ? "bg-red-50 border border-red-200"
                  : "bg-gray-50 border border-gray-200"
              )}
            >
              {pf.error ? (
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "truncate",
                    pf.error ? "text-red-700" : "text-gray-900"
                  )}
                >
                  {pf.file.name}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    pf.error ? "text-red-600" : "text-gray-500"
                  )}
                >
                  {formatSize(pf.file.size)}
                  {pf.error && ` · ${pf.error}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(pf.id)}
                disabled={disabled}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50 shrink-0"
                aria-label="Quitar archivo"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
