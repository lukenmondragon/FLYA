import "server-only";
import { z } from "zod";

/** Variables de entorno de servidor. Nunca se exponen al cliente (sin prefijo NEXT_PUBLIC_). */
const EnvSchema = z.object({
  FLIGHT_PROVIDER: z.enum(["mock", "travelpayouts", "auto"]).default("auto"),
  TRAVELPAYOUTS_TOKEN: z.string().optional(),
  TRAVELPAYOUTS_MARKER: z.string().optional(),
  /** Dominio de compra de Aviasales para los enlaces ("www.aviasales.com", "www.aviasales.es"...). */
  TRAVELPAYOUTS_LINK_HOST: z.string().default("www.aviasales.com"),
  TRAVELPAYOUTS_MARKET: z.string().optional(),

  LLM_PROVIDER: z.enum(["auto", "anthropic", "gemini", "rules"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  /** Modelos de respaldo (separados por comas) si el principal está saturado o no disponible. */
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3.5-flash,gemini-3.5-flash-lite"),

  DATABASE_URL: z.string().default("file:.data/vuelos.db"),

  DEFAULT_CURRENCY: z.string().length(3).default("EUR"),
  MAX_ORIGIN_AIRPORTS: z.coerce.number().int().min(1).max(12).default(6),
  MAX_DESTINATION_AIRPORTS: z.coerce.number().int().min(1).max(12).default(6),
  MAX_PROVIDER_CALLS_PER_QUERY: z.coerce.number().int().min(1).max(100).default(16),
  /** Presupuesto diario de llamadas al proveedor real (0 = sin límite). */
  DAILY_PROVIDER_CALL_BUDGET: z.coerce.number().int().min(0).default(2000),
  PROVIDER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  CACHE_TTL_MINUTES: z.coerce.number().int().min(1).max(10080).default(180),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(8),
  RATE_LIMIT_PER_DAY: z.coerce.number().int().min(1).default(120),

  ADS_ENABLED: z.enum(["true", "false"]).default("false"),
  ANALYTICS_ENABLED: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    // Las variables vacías del .env cuentan como no definidas.
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    cached = EnvSchema.parse(raw);
  }
  return cached;
}

/** Solo para tests. */
export function resetEnvCache() {
  cached = undefined;
}
