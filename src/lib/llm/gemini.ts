import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { EXPLAIN_SYSTEM, PARSE_SYSTEM } from "./prompts";
import { LlmExplainSchema, LlmParseSchema, llmToParseResult } from "./schema";
import { log } from "../log";
import { withRetry } from "../util/async";
import { userParseMessage, type LLMProvider, type LlmUsage, type ParseInput } from "./types";

// Precio orientativo de pago de Gemini Flash (USD / millón de tokens). En el plan gratuito el coste es 0.
const PRICE = { input: 0.3, output: 2.5, cached: 0.075 };

export class GeminiLLM implements LLMProvider {
  readonly id = "gemini" as const;
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async call(system: string, user: string, schema: z.ZodType): Promise<{ json: unknown; usage: LlmUsage }> {
    const jsonSchema = toGeminiSchema(z.toJSONSchema(schema));
    try {
      return await this.generate(system, user, jsonSchema);
    } catch (e) {
      // Solo se reintenta si el modelo rechaza la petición (400); un timeout o un 5xx se repetirían igual.
      if (!/"code":\s*400|INVALID_ARGUMENT/.test(String(e))) throw e;
      // Si el modelo rechaza el esquema, se repite en modo JSON con el esquema en las instrucciones.
      // La salida se valida igualmente con Zod.
      log.warn("Gemini: reintento sin esquema estructurado", { error: String(e).slice(0, 300) });
      return this.generate(`${system}\n\nResponde SOLO con un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(jsonSchema)}`, user);
    }
  }

  private async generate(system: string, user: string, jsonSchema?: unknown): Promise<{ json: unknown; usage: LlmUsage }> {
    // Extracción sencilla: poco razonamiento (más rápido y barato). Gemini 2.x usa presupuesto; 3.x, nivel.
    // Sin este ajuste, Gemini 3 razona a fondo y tarda más de lo aceptable.
    const thinkingConfig = this.model.startsWith("gemini-2") ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.LOW };
    // Un reintento ante saturación temporal del modelo (429/503).
    const res = await withRetry(() => this.ai.models.generateContent({
      model: this.model,
      contents: user,
      config: {
        // Gemini aplica caché implícita a prefijos repetidos (el system prompt es estable).
        systemInstruction: system,
        responseMimeType: "application/json",
        ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
        temperature: 0.1,
        thinkingConfig,
        abortSignal: AbortSignal.timeout(12_000),
      },
    }), { retries: 1, baseMs: 600, isRetryable: (e) => /"code":\s*(429|503)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(String(e)) });
    const text = res.text;
    if (!text) throw new Error("Respuesta vacía de Gemini");
    const u = res.usageMetadata;
    const cached = u?.cachedContentTokenCount ?? 0;
    const input = u?.promptTokenCount ?? 0;
    const output = u?.candidatesTokenCount ?? 0;
    return {
      json: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")),
      usage: { inputTokens: input, outputTokens: output, cachedTokens: cached, costUsd: ((input - cached) * PRICE.input + cached * PRICE.cached + output * PRICE.output) / 1e6 },
    };
  }

  async parse(input: ParseInput) {
    const { json, usage } = await this.call(PARSE_SYSTEM, userParseMessage(input), LlmParseSchema);
    return { result: llmToParseResult(LlmParseSchema.parse(json)), usage };
  }

  async explain(context: string, extraInstruction?: string) {
    const user = extraInstruction ? `${context}\n\nATENCIÓN: ${extraInstruction}` : context;
    const { json, usage } = await this.call(EXPLAIN_SYSTEM, user, LlmExplainSchema);
    return { data: LlmExplainSchema.parse(json), usage };
  }
}

/**
 * Adapta el JSON Schema de Zod al subconjunto que acepta Gemini:
 * sin "$schema" ni "additionalProperties", y los tipos ["x", "null"] como anyOf.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "$schema" || k === "additionalProperties") continue;
    out[k] = toGeminiSchema(v);
  }
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    delete out.type;
    const rest = { ...out };
    for (const k of Object.keys(out)) delete out[k];
    out.anyOf = types.map((t) => (t === "null" ? { type: "null" } : { ...rest, type: t }));
  }
  return out;
}
