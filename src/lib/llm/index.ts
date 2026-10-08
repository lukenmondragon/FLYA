import "server-only";
import { env } from "../env";
import { log, type SearchMetrics } from "../log";
import type { ParseResult, SearchQuery } from "../schema/query";
import { todayISO } from "../util/dates";
import { AnthropicLLM } from "./anthropic";
import { GeminiLLM } from "./gemini";
import { parseWithRules } from "./rules";
import type { LLMProvider, LlmUsage } from "./types";

/** Selecciona el LLM según LLM_PROVIDER y las claves disponibles. undefined = solo reglas. */
export function getLLM(): LLMProvider | undefined {
  const e = env();
  const p = e.LLM_PROVIDER;
  if (p === "rules") return undefined;
  if ((p === "anthropic" || p === "auto") && e.ANTHROPIC_API_KEY) return new AnthropicLLM(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL);
  if ((p === "gemini" || p === "auto") && e.GEMINI_API_KEY) return new GeminiLLM(e.GEMINI_API_KEY, e.GEMINI_MODEL);
  return undefined;
}

export function addUsage(m: SearchMetrics, u: LlmUsage) {
  m.llmInputTokens += u.inputTokens;
  m.llmOutputTokens += u.outputTokens;
  m.llmCachedTokens += u.cachedTokens;
  m.llmCostUsd += u.costUsd;
}

/** Interpreta el mensaje con el LLM; si no hay LLM o falla, usa las reglas. */
export async function interpret(message: string, previous: SearchQuery | undefined, history: string[] | undefined, metrics: SearchMetrics): Promise<{ result: ParseResult; parser: string }> {
  const llm = getLLM();
  if (llm) {
    try {
      const { result, usage } = await llm.parse({ message, previous, history, today: todayISO() });
      addUsage(metrics, usage);
      log.info("LLM parse", { provider: llm.id, model: llm.model, in: usage.inputTokens, out: usage.outputTokens, cached: usage.cachedTokens, costUsd: Number(usage.costUsd.toFixed(6)) });
      return { result, parser: `${llm.id}:${llm.model}` };
    } catch (e) {
      log.warn("LLM parse falló; uso reglas", { provider: llm.id, error: String(e) });
    }
  }
  return { result: parseWithRules(message, { previous }), parser: "reglas" };
}
