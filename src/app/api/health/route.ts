import { getFlightProvider } from "@/lib/providers";
import { getLLM } from "@/lib/llm";
import { getStore } from "@/lib/db/store";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { todayISO } from "@/lib/util/dates";
import { requireAccess } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de la configuración (sin exponer secretos).
 * /api/health?llm=1 hace además una llamada de prueba al LLM y devuelve el error si falla.
 */
export async function GET(req: Request) {
  const access = await requireAccess();
  if (!access.ok) return access.response;
  const provider = getFlightProvider();
  const llm = getLLM();
  const store = await getStore();
  let llmCheck: { ok: boolean; error?: string; ms?: number } | undefined;
  if (llm && new URL(req.url).searchParams.get("llm") === "1") {
    const rl = await checkRateLimit(clientIp(req.headers));
    if (!rl.ok) return Response.json({ error: rl.message }, { status: 429 });
    const t = Date.now();
    try {
      await llm.parse({ message: "desde Madrid a Roma en mayo", today: todayISO() });
      llmCheck = { ok: true, ms: Date.now() - t };
    } catch (e) {
      llmCheck = { ok: false, error: String(e).slice(0, 400), ms: Date.now() - t };
    }
  }
  return Response.json({
    ok: true,
    provider: { id: provider.id, demo: provider.isDemo },
    llm: llm ? { id: llm.id, model: llm.model, ...(llmCheck ? { check: llmCheck } : {}) } : { id: "reglas" },
    store: store.kind,
  });
}
