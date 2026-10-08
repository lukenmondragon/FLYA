import "server-only";
import { getStore } from "./db/store";
import { env } from "./env";

/**
 * Límite básico por IP (por minuto y por día) para proteger la cuota de IA y del proveedor.
 * Usa la misma capa de persistencia: con Postgres/Turso es compartido entre instancias de Vercel;
 * en memoria es por instancia (suficiente para un MVP).
 */
export async function checkRateLimit(ip: string): Promise<{ ok: true } | { ok: false; retryAfter: number; message: string }> {
  const e = env();
  const store = await getStore();
  const now = new Date();
  const minuteKey = `rl:m:${ip}:${now.toISOString().slice(0, 16)}`;
  const dayKey = `rl:d:${ip}:${now.toISOString().slice(0, 10)}`;
  const perMin = await store.incr(minuteKey, 1, 60);
  if (perMin > e.RATE_LIMIT_PER_MINUTE) return { ok: false, retryAfter: 60 - now.getSeconds(), message: "Demasiadas búsquedas seguidas. Espera un minuto." };
  const perDay = await store.incr(dayKey, 1, 86_400);
  if (perDay > e.RATE_LIMIT_PER_DAY) return { ok: false, retryAfter: 3600, message: "Has alcanzado el límite diario de búsquedas. Vuelve mañana." };
  return { ok: true };
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}
