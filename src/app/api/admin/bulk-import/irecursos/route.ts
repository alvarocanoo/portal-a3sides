import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  bulkImportFromIRecursos,
  MAX_PAGES_HARD_CAP,
} from "@/services/bulk-import.service";

const bodySchema = z.object({
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGES_HARD_CAP, `maxPages no puede superar ${MAX_PAGES_HARD_CAP}`),
  sendOnboardingEmails: z.boolean().optional().default(false),
  pauseMs: z.number().int().min(500).max(10_000).optional().default(1500),
});

/**
 * Endpoint de importación masiva de clientes desde iRecursos.
 *
 * Solo ADMIN. Síncrono. Recibe `{ maxPages, sendOnboardingEmails?, pauseMs? }`
 * y devuelve el `BulkImportStats` completo.
 *
 * El cap duro de páginas vive en el servicio (MAX_PAGES_HARD_CAP). El Zod
 * de aquí lo expone como límite de validación. Para subirlo hay que tocar
 * `bulk-import.service.ts` a propósito — no se puede saltar desde HTTP.
 *
 * Como es síncrono, el caller espera la respuesta. Para 2-3 páginas con
 * pausa de 1.5 s tarda ~5-8 s, aceptable. Para 50 páginas serían ~80 s
 * — al borde. Si en el futuro queremos las 447 páginas reales, hay que
 * pasar a job en background; no aplica para la fase de verificación.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    const stats = await bulkImportFromIRecursos({
      maxPages: parsed.data.maxPages,
      sendOnboardingEmails: parsed.data.sendOnboardingEmails,
      pauseMs: parsed.data.pauseMs,
      adminUserId: session.user.id,
    });

    return NextResponse.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error(`[bulk-import] Falló la importación: ${msg}`);
    return NextResponse.json(
      { error: `Error en la importación: ${msg}` },
      { status: 500 }
    );
  }
}
