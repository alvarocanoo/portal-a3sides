"use client";

import { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Lightbox modal para previsualizar imágenes adjuntas a tamaño completo.
 *
 * Seguridad: este componente no introduce ningún punto de entrega de
 * bytes. Tanto la `<img src>` como el "Abrir original" (`<a href>`)
 * apuntan al mismo endpoint `/api/attachments/[id]` que ya valida sesión,
 * companyId del CLIENT y mensaje interno. Si el servidor responde 403,
 * la imagen aparece rota.
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Bloqueamos el scroll del body mientras el lightbox está montado para
    // que el usuario no haga scroll por debajo del overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${alt}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
    >
      {/* Botonera superior — z-10 por encima de la imagen para no quedar
          tapada cuando la imagen es muy alta. */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
          title="Abrir original en pestaña nueva"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir original
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar vista previa"
          className="inline-flex items-center justify-center h-9 w-9 bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* La imagen captura el clic para que no se propague al overlay (eso
          cerraría el lightbox al pulsarla). El clic en el resto del
          overlay sí cierra (UX estándar de visor de imágenes). */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain rounded shadow-2xl"
      />
    </div>
  );
}
