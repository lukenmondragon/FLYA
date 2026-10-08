import "server-only";
import { env } from "./env";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = Exclude<keyof typeof LEVELS, "silent">;

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[env().LOG_LEVEL]) return;
  const line = `[flya] ${level.toUpperCase()} ${msg}${data ? " " + JSON.stringify(data) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => emit("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => emit("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => emit("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => emit("error", m, d),
};

/** Métricas de una búsqueda, para los logs de desarrollo. */
export interface SearchMetrics {
  providerCalls: number;
  cacheHits: number;
  cacheMisses: number;
  skippedByBudget: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  llmCachedTokens: number;
  llmCostUsd: number;
  ms: number;
}

export function newMetrics(): SearchMetrics {
  return { providerCalls: 0, cacheHits: 0, cacheMisses: 0, skippedByBudget: 0, llmInputTokens: 0, llmOutputTokens: 0, llmCachedTokens: 0, llmCostUsd: 0, ms: 0 };
}
