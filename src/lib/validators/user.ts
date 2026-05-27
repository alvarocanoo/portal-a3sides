import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email("Email inválido").max(255),
  firstName: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100),
  lastName: z
    .string()
    .min(1, "Los apellidos son obligatorios")
    .max(100),
  role: z.enum(["CLIENT", "AGENT", "ADMIN"]),
  companyId: z.string().uuid("ID de empresa inválido").optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(["CLIENT", "AGENT", "ADMIN"]).optional(),
  companyId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createCompanySchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(200),
  taxId: z.string().max(20).optional(),
  irecursosClientId: z.string().max(100).optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  taxId: z.string().max(20).nullable().optional(),
  irecursosClientId: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});
