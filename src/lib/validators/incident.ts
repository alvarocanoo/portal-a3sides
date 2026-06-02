import { z } from "zod";

// CLIENTE NO PUEDE FIJAR LA PRIORIDAD AL CREAR.
// El campo `priority` queda fuera del schema a propósito: si llega en el
// body, Zod lo descarta (no usamos .strict() para no devolver 400 ante
// clientes programáticos legacy que pudieran mandarlo). El servicio nunca
// lo recibe y la BD aplica el default `MEDIUM` definido en el schema de
// Prisma. El triaje (cambio de prioridad) lo hace AGENT/ADMIN vía
// `updateIncidentPrioritySchema` + endpoint dedicado.
export const createIncidentSchema = z.object({
  subject: z
    .string()
    .min(5, "El asunto debe tener al menos 5 caracteres")
    .max(200, "El asunto no puede superar 200 caracteres"),
  description: z
    .string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(10000, "La descripción no puede superar 10.000 caracteres"),
  category: z.string().max(100).optional(),
});

export const updateIncidentPrioritySchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export const updateIncidentStatusSchema = z.object({
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "WAITING_CLIENT",
    "WAITING_THIRD_PARTY",
    "RESOLVED",
    "CLOSED",
  ]),
  reason: z.string().max(500).optional(),
});

export const assignIncidentSchema = z.object({
  assignedToId: z.string().uuid("ID de agente inválido"),
});

export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacío")
    .max(10000, "El mensaje no puede superar 10.000 caracteres"),
  isInternal: z.boolean().default(false),
});

// El enum `status` del listado acepta los 6 valores reales y 3
// pseudo-valores. Los pseudo los expanden los helpers
// `expandClientStatusFilter` (CLIENT) y `expandStaffStatusFilter`
// (AGENT/ADMIN) según rol, antes de pasarlos al servicio:
//   IN_PROCESS    → CLIENT: IN_PROGRESS + WAITING_THIRD_PARTY
//   CLOSED_GROUP  → CLIENT: RESOLVED + CLOSED
//   ALL           → ambos: sin filtro (incluye cerradas)
//
// `preprocess` convierte "" (cadena vacía — viene del dropdown cuando
// el usuario elige la primera opción) a undefined antes del enum check.
// Sin esto, `z.enum([...]).optional()` rechaza "" con 400 (bug A1).
export const listIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .enum([
        "OPEN",
        "IN_PROGRESS",
        "WAITING_CLIENT",
        "WAITING_THIRD_PARTY",
        "RESOLVED",
        "CLOSED",
        "IN_PROCESS",
        "CLOSED_GROUP",
        "ALL",
      ])
      .optional()
  ),
  priority: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional()
  ),
  search: z.string().max(200).optional(),
  assignedToId: z.string().uuid().optional(),
});
