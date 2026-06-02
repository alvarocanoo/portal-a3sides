/**
 * Política de contraseñas — FUENTE ÚNICA DE VERDAD.
 *
 * Se aplica en:
 *   - backend: src/app/api/auth/change-password/route.ts (al cambiar)
 *   - backend: src/services/user.service.ts (generación de temporales)
 *   - frontend: src/app/cambiar-password/cambiar-password-form.tsx
 *               (feedback visible de qué requisitos se cumplen)
 *
 * Decisión: 10 caracteres mínimo + mezcla obligatoria de mayúscula,
 * minúscula y dígito. Los símbolos se recomiendan pero no se exigen
 * (no añaden seguridad notable si ya hay 10+ chars con mezcla, y la
 * UX mejora al evitar la fricción del símbolo obligatorio).
 */

export interface PasswordRequirement {
  id: string;
  label: string;
  check: (pw: string) => boolean;
}

export const PASSWORD_POLICY: {
  minLength: number;
  requirements: PasswordRequirement[];
} = {
  minLength: 10,
  requirements: [
    {
      id: "length",
      label: "Al menos 10 caracteres",
      check: (pw) => pw.length >= 10,
    },
    {
      id: "upper",
      label: "Al menos una mayúscula (A-Z)",
      check: (pw) => /[A-Z]/.test(pw),
    },
    {
      id: "lower",
      label: "Al menos una minúscula (a-z)",
      check: (pw) => /[a-z]/.test(pw),
    },
    {
      id: "digit",
      label: "Al menos un dígito (0-9)",
      check: (pw) => /[0-9]/.test(pw),
    },
  ],
};

export interface PasswordValidationResult {
  valid: boolean;
  /** Etiquetas de los requisitos que NO se cumplen. */
  failed: string[];
}

export function validatePassword(pw: string): PasswordValidationResult {
  const failed = PASSWORD_POLICY.requirements
    .filter((r) => !r.check(pw))
    .map((r) => r.label);
  return { valid: failed.length === 0, failed };
}

/**
 * Mensaje compacto para devolver en respuestas 400. Indica todos los
 * requisitos que el password no cumple para que el usuario pueda
 * corregir de una pasada en vez de ir uno a uno.
 */
export function passwordPolicyError(pw: string): string | null {
  const result = validatePassword(pw);
  if (result.valid) return null;
  return "La contraseña no cumple los requisitos: " + result.failed.join("; ");
}
