import { getFlightProvider } from "@/lib/providers";
import { getLLM } from "@/lib/llm";
import { getStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado de la configuración (sin exponer secretos). */
export async function GET() {
  const provider = getFlightProvider();
  const llm = getLLM();
  const store = await getStore();
  return Response.json({
    ok: true,
    provider: { id: provider.id, demo: provider.isDemo },
    llm: llm ? { id: llm.id, model: llm.model } : { id: "reglas" },
    store: store.kind,
  });
}
