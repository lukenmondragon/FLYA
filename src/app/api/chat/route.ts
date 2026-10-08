import { z } from "zod";
import { SearchQuerySchema } from "@/lib/schema/query";
import type { ChatEvent } from "@/lib/schema/api";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { interpret } from "@/lib/llm";
import { explain } from "@/lib/llm/explain";
import { runSearch, SearchError } from "@/lib/search/engine";
import { log, newMetrics } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  message: z.string().trim().min(2).max(600),
  previousQuery: SearchQuerySchema.optional(),
  history: z.array(z.string().max(600)).max(6).optional(),
});

/**
 * POST /api/chat — interpreta el mensaje, busca y explica. Responde en streaming NDJSON
 * (un ChatEvent por línea) para mostrar progreso mientras se consulta al proveedor.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = await checkRateLimit(ip);
  if (!rl.ok) return Response.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Petición no válida." }, { status: 400 });
  }

  const metrics = newMetrics();
  const started = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "status", message: body.previousQuery ? "Ajustando tu búsqueda…" : "Entendiendo lo que buscas…" });
        const { result, parser } = await interpret(body.message, body.previousQuery, body.history, metrics);
        send({ type: "parsed", query: result.query, assumptions: result.assumptions, isRefinement: result.isRefinement, parser });
        if (result.questions.length) {
          send({ type: "question", questions: result.questions, query: result.query });
          send({ type: "done" });
          return;
        }
        const outcome = await runSearch(result.query, metrics, {
          onStatus: (message) => send({ type: "status", message }),
          onProgress: (done, total, message) => send({ type: "progress", done, total, message }),
        });
        send({ type: "results", outcome });
        if (outcome.primary.length || outcome.alternatives.length) {
          send({ type: "status", message: "Analizando resultados…" });
          const ex = await explain(outcome, body.message, metrics);
          send({ type: "explanation", ...ex });
        }
        send({ type: "done" });
      } catch (e) {
        const message = e instanceof SearchError ? e.message : "Algo ha fallado al buscar. Inténtalo de nuevo en unos segundos.";
        if (!(e instanceof SearchError)) log.error("Error en /api/chat", { error: String(e), stack: e instanceof Error ? e.stack : undefined });
        send({ type: "error", message });
        send({ type: "done" });
      } finally {
        log.info("Petición", {
          ms: Date.now() - started,
          providerCalls: metrics.providerCalls,
          cacheHits: metrics.cacheHits,
          cacheMisses: metrics.cacheMisses,
          llmIn: metrics.llmInputTokens,
          llmOut: metrics.llmOutputTokens,
          llmCached: metrics.llmCachedTokens,
          llmCostUsd: Number(metrics.llmCostUsd.toFixed(6)),
        });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
