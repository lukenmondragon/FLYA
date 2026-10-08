import "server-only";
import { auth } from "@/auth";
import { accessFor } from "./access";

/** Comprobación en el propio handler (además del proxy), por si una ruta quedara fuera del matcher. */
export async function requireAccess(): Promise<{ ok: true; email?: string } | { ok: false; response: Response }> {
  const session = await auth();
  const email = session?.user?.email ?? undefined;
  const decision = accessFor(email);
  if (decision === "allow") return { ok: true, email };
  return { ok: false, response: Response.json({ error: decision === "locked" ? "Acceso no configurado." : "Inicia sesión para usar el buscador." }, { status: 401 }) };
}
