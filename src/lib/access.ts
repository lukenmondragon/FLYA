/**
 * Política de acceso (sin dependencias de servidor, para poder probarla).
 * Solo entran los correos de ALLOWED_EMAILS. Sin Auth configurado:
 * en desarrollo la app queda abierta; en producción, bloqueada.
 */
export function allowedEmails(raw = process.env.ALLOWED_EMAILS): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Nombres (nunca valores) de las variables de acceso que faltan. */
export function missingAuthVars(env: Record<string, string | undefined> = process.env): string[] {
  const missing = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"].filter((k) => !env[k]?.trim());
  if (!allowedEmails(env.ALLOWED_EMAILS).length) missing.push("ALLOWED_EMAILS");
  return missing;
}

export function authConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.AUTH_SECRET && env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET && allowedEmails(env.ALLOWED_EMAILS).length);
}

export function isAllowedEmail(email: string | null | undefined, raw = process.env.ALLOWED_EMAILS): boolean {
  if (!email) return false;
  return allowedEmails(raw).includes(email.trim().toLowerCase());
}

export type AccessDecision = "allow" | "login" | "locked";

/** Decide qué hacer con una petición según la sesión y la configuración. */
export function accessFor(email: string | null | undefined, env: Record<string, string | undefined> = process.env): AccessDecision {
  if (!authConfigured(env)) return env.NODE_ENV === "production" ? "locked" : "allow";
  return isAllowedEmail(email, env.ALLOWED_EMAILS) ? "allow" : "login";
}
