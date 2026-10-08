import type { ParseResult, SearchQuery } from "../schema/query";
import type { LlmExplain } from "./schema";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export interface ParseInput {
  message: string;
  previous?: SearchQuery;
  history?: string[];
  today: string;
}

export interface LLMProvider {
  readonly id: "anthropic" | "gemini" | "rules";
  readonly model: string;
  parse(input: ParseInput): Promise<{ result: ParseResult; usage: LlmUsage }>;
  explain(context: string, extraInstruction?: string): Promise<{ data: LlmExplain; usage: LlmUsage }>;
}

export function userParseMessage(input: ParseInput): string {
  const parts = [`HOY: ${input.today}`];
  if (input.previous) parts.push(`CONSULTA_PREVIA: ${JSON.stringify(input.previous)}`);
  if (input.history?.length) parts.push(`MENSAJES_ANTERIORES: ${input.history.slice(-3).join(" | ")}`);
  parts.push(`MENSAJE: ${input.message}`);
  return parts.join("\n");
}
