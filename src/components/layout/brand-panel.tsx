import Image from "next/image";

/**
 * Panel de marca compartido por las pantallas de autenticación (/login y
 * /cambiar-password). Se renderiza a la izquierda del split-screen en
 * desktop y como banda superior compacta en móvil.
 *
 * Es Server Component puro — no tiene estado, solo presentación.
 * Si se cambia algo aquí, se refleja en TODAS las pantallas de auth.
 */
export function BrandPanel() {
  return (
    <aside
      className="
        bg-gradient-to-br from-[#275d6b] to-[#1d4651]
        text-white
        flex flex-col
        px-8 py-10
        md:w-[45%] md:p-12 md:justify-between
      "
    >
      {/* Logo: pastilla blanca con el PNG real recortado (mismo patrón
          que el sidebar para tirar el padding interno del archivo). */}
      <div className="flex justify-center md:justify-start">
        <div className="bg-white rounded-xl shadow-md p-5">
          <div className="overflow-hidden" style={{ height: 76 }}>
            <Image
              src="/logoa3sides.png"
              alt="a3sides Software Solutions"
              width={225}
              height={225}
              className="max-w-none"
              style={{
                width: 184,
                height: 184,
                marginTop: -53,
                marginBottom: -55,
              }}
              priority
              unoptimized
            />
          </div>
        </div>
      </div>

      {/* Mensaje de marca (solo desktop): título + línea de apoyo. */}
      <div className="hidden md:block">
        <h1 className="text-3xl font-semibold tracking-tight">
          Portal de Soporte
        </h1>
        <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-xs">
          Gestión de incidencias y soporte técnico de a3sides.
        </p>
      </div>

      {/* Título compacto (solo mobile) bajo el logo. */}
      <p className="md:hidden text-center mt-4 text-[11px] font-semibold tracking-[0.12em] text-white/80 uppercase">
        Portal de Soporte
      </p>
    </aside>
  );
}
