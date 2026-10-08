import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EXPLAIN_SYSTEM, PARSE_SYSTEM } from "./prompts";
import { LlmExplainSchema, LlmParseSchema, llmToParseResult } from "./schema";
import { userParseMessage, type LLMProvider, type LlmUsage, type ParseInput } from "./types";

// Precios por millón de tokens (USD) de Claude Haiku 5.5 con prompts ≤100K tokens.
const PRICE = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

function usageOf(u: Anthropic.Usage): LlmUsage {
  const cachedRead = u.cache_read_input_tokens ?? 0;
  const cachedWrite = u.cache_creation_input_tokens ?? 0;
  const costUsd = (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + cachedRead * PRICE.cacheRead + cachedWrite * PRICE.cacheWrite) / 1e6;
  return { inputTokens: u.input_tokens + cachedRead + cachedWrite, outputTokens: u.output_tokens, cachedTokens: cachedRead, costUsd };
}

export class AnthropicLLM implements LLMProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 20_000 });
  }

  private async call<T>(system: string, user: string, format: ReturnType<typeof zodOutputFormat<any>>, maxTokens: number) {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: maxTokens,
      // Prompt de sistema estable con cache_control: las llamadas siguientes leen el prefijo de caché.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      // Tarea de extracción simple: esfuerzo bajo y sin razonamiento para minimizar coste y latencia.
      thinking: { type: "disabled" },
      output_config: { format, effort: "low" },
    });
    if (res.stop_reason === "refusal") throw new Error("El modelo rechazó la petición");
    if (res.stop_reason === "max_tokens") throw new Error("Respuesta truncada");
    if (!res.parsed_output) throw new Error("Salida estructurada vacía");
    return { parsed: res.parsed_output as T, usage: usageOf(res.usage) };
  }

  async parse(input: ParseInput) {
    const { parsed, usage } = await this.call<import("./schema").LlmParse>(PARSE_SYSTEM, userParseMessage(input), zodOutputFormat(LlmParseSchema), 2000);
    return { result: llmToParseResult(LlmParseSchema.parse(parsed)), usage };
  }

  async explain(context: string, extraInstruction?: string) {
    const user = extraInstruction ? `${context}\n\nATENCIÓN: ${extraInstruction}` : context;
    const { parsed, usage } = await this.call<import("./schema").LlmExplain>(EXPLAIN_SYSTEM, user, zodOutputFormat(LlmExplainSchema), 1500);
    return { data: LlmExplainSchema.parse(parsed), usage };
  }
}
