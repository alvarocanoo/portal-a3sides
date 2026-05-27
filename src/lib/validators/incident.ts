import { z } from "zod";

export const createIncidentSchema = z.object({
  subject: z
    .string()
    .min(5, "El asunto debe tener al menos 5 caracteres")
    .max(200, "El asunto no puede superar 200 caracteres"),
  description: z
    .string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(10000, "La descripción no puede superar 10.000 caracteres"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  category: z.string().max(100).optional(),
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

export const listIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      "OPEN",
      "IN_PROGRESS",
      "WAITING_CLIENT",
      "WAITING_THIRD_PARTY",
      "RESOLVED",
      "CLOSED",
    ])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  search: z.string().max(200).optional(),
  assignedToId: z.string().uuid().optional(),
});
