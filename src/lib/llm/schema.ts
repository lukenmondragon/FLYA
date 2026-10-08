import { z } from "zod";
import { SearchQuerySchema, type ParseResult, type SearchQuery } from "../schema/query";

/**
 * Esquema "plano" que se pide al LLM (salida estructurada). Todos los campos son obligatorios
 * y anulables: es lo que mejor funciona con salidas estructuradas de Claude y Gemini.
 * Después se convierte y valida contra SearchQuerySchema.
 */
const LlmPlace = z.object({
  name: z.string(),
  country: z.string().nullable().describe("ISO 3166-1 alfa-2, p. ej. ES, MX"),
  iata: z.array(z.string()).describe("Códigos IATA solo si son seguros (aeropuerto o ciudad, p. ej. TYO)"),
  lat: z.number().nullable().describe("Solo para pueblos pequeños sin aeropuerto"),
  lon: z.number().nullable(),
  optional: z.boolean().describe("true si el usuario lo menciona como 'solo si compensa'"),
});

export const LlmParseSchema = z.object({
  is_refinement: z.boolean(),
  origins: z.array(LlmPlace),
  destinations: z.array(LlmPlace),
  destination_mode: z.enum(["specific", "anywhere"]),
  destination_tags: z.array(z.string()),
  trip_type: z.enum(["roundtrip", "oneway"]),
  departure_date: z.string().nullable().describe("YYYY-MM-DD"),
  departure_month: z.string().nullable().describe("YYYY-MM"),
  flex_days: z.number().int(),
  return_date: z.string().nullable(),
  return_month: z.string().nullable(),
  stay_min_days: z.number().int().nullable(),
  stay_max_days: z.number().int().nullable(),
  long_weekends: z.boolean(),
  adults: z.number().int(),
  children: z.number().int(),
  infants: z.number().int(),
  budget_amount: z.number().nullable(),
  budget_currency: z.string().nullable(),
  currency: z.string().nullable(),
  priorities: z.array(z.enum(["price", "duration", "comfort", "schedule", "airline"])),
  direct_only: z.boolean(),
  max_stops: z.number().int().nullable(),
  max_layover_hours: z.number().nullable(),
  baggage_included: z.boolean(),
  avoid_overnight_layovers: z.boolean(),
  preferred_airlines: z.array(z.string()),
  excluded_airlines: z.array(z.string()),
  only_airports: z.array(z.string()),
  excluded_airports: z.array(z.string()),
  nearby_origins: z.boolean(),
  nearby_destinations: z.boolean(),
  radius_km: z.number().int(),
  allow_foreign_origins: z.boolean(),
  assumptions: z.array(z.string()),
  questions: z.array(z.string()),
});
export type LlmParse = z.infer<typeof LlmParseSchema>;

const PLACE_DEFAULTS = { country: null, iata: [], lat: null, lon: null, optional: false };
const PARSE_DEFAULTS: LlmParse = {
  is_refinement: false, origins: [], destinations: [], destination_mode: "specific", destination_tags: [], trip_type: "roundtrip",
  departure_date: null, departure_month: null, flex_days: 0, return_date: null, return_month: null, stay_min_days: null, stay_max_days: null,
  long_weekends: false, adults: 1, children: 0, infants: 0, budget_amount: null, budget_currency: null, currency: null, priorities: ["price"],
  direct_only: false, max_stops: null, max_layover_hours: null, baggage_included: false, avoid_overnight_layovers: false,
  preferred_airlines: [], excluded_airlines: [], only_airports: [], excluded_airports: [], nearby_origins: true, nearby_destinations: false,
  radius_km: 300, allow_foreign_origins: true, assumptions: [], questions: [],
};

/**
 * Valida la salida del LLM tolerando campos ausentes o nulos (algunos modelos omiten los que no aplican):
 * se completan con los valores por defecto antes de validar.
 */
export function parseLlmOutput(json: unknown): LlmParse {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const clean = Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== null || (PARSE_DEFAULTS as Record<string, unknown>)[k] === null));
  const place = (p: unknown) => ({ ...PLACE_DEFAULTS, ...(typeof p === "string" ? { name: p } : (p as object)) });
  const merged = {
    ...PARSE_DEFAULTS,
    ...clean,
    origins: Array.isArray(o.origins) ? o.origins.map(place) : [],
    destinations: Array.isArray(o.destinations) ? o.destinations.map(place) : [],
  };
  return LlmParseSchema.parse(merged);
}

const iataOk = (s: string) => /^[A-Z]{3}$/.test(s);
const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

function place(p: LlmParse["origins"][number]) {
  return {
    name: p.name.slice(0, 80),
    ...(p.country && /^[A-Za-z]{2}$/.test(p.country) ? { country: p.country.toUpperCase() } : {}),
    ...(p.iata.filter(iataOk).length ? { iata: p.iata.filter(iataOk).slice(0, 8) } : {}),
    ...(p.lat !== null && p.lon !== null && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? { lat: p.lat, lon: p.lon } : {}),
    ...(p.optional ? { optional: true } : {}),
  };
}

/** Convierte la salida del LLM al esquema interno, recortando valores fuera de rango. */
export function llmToParseResult(x: LlmParse): ParseResult {
  const query: SearchQuery = SearchQuerySchema.parse({
    origins: x.origins.slice(0, 6).map(place),
    destinations: x.destinations.slice(0, 6).map(place),
    destinationMode: x.destination_mode,
    destinationTags: x.destination_tags.slice(0, 5).map((t) => t.slice(0, 20)),
    tripType: x.trip_type,
    departure: {
      ...(x.departure_date && /^\d{4}-\d{2}-\d{2}$/.test(x.departure_date) ? { date: x.departure_date } : {}),
      ...(x.departure_month && /^\d{4}-\d{2}$/.test(x.departure_month) && !x.departure_date ? { month: x.departure_month } : {}),
      flexDays: clampInt(x.flex_days, 0, 7),
    },
    return:
      x.trip_type === "roundtrip" && (x.return_date || x.return_month)
        ? {
            ...(x.return_date && /^\d{4}-\d{2}-\d{2}$/.test(x.return_date) ? { date: x.return_date } : {}),
            ...(x.return_month && /^\d{4}-\d{2}$/.test(x.return_month) && !x.return_date ? { month: x.return_month } : {}),
            flexDays: clampInt(x.flex_days, 0, 7),
          }
        : undefined,
    stayDays: x.stay_min_days && x.stay_max_days ? { min: clampInt(x.stay_min_days, 1, 60), max: clampInt(Math.max(x.stay_max_days, x.stay_min_days), 1, 90) } : undefined,
    longWeekends: x.long_weekends,
    passengers: { adults: clampInt(x.adults || 1, 1, 9), children: clampInt(x.children, 0, 8), infants: clampInt(x.infants, 0, 4) },
    budget: x.budget_amount && x.budget_amount > 0 && x.budget_currency && /^[A-Za-z]{3}$/.test(x.budget_currency) ? { amount: x.budget_amount, currency: x.budget_currency.toUpperCase() } : undefined,
    currency: x.currency && /^[A-Za-z]{3}$/.test(x.currency) ? x.currency.toUpperCase() : undefined,
    priorities: x.priorities.length ? [...new Set(x.priorities)].slice(0, 5) : ["price"],
    constraints: {
      directOnly: x.direct_only,
      maxStops: x.direct_only ? 0 : x.max_stops === null ? undefined : clampInt(x.max_stops, 0, 3),
      maxLayoverHours: x.max_layover_hours === null ? undefined : Math.max(1, Math.min(48, x.max_layover_hours)),
      baggageIncluded: x.baggage_included,
      avoidOvernightLayovers: x.avoid_overnight_layovers,
      preferredAirlines: x.preferred_airlines.slice(0, 5).map((s) => s.slice(0, 40)),
      excludedAirlines: x.excluded_airlines.slice(0, 5).map((s) => s.slice(0, 40)),
      onlyAirports: x.only_airports.map((s) => s.toUpperCase()).filter(iataOk).slice(0, 10),
      excludedAirports: x.excluded_airports.map((s) => s.toUpperCase()).filter(iataOk).slice(0, 10),
    },
    flexibility: {
      nearbyOrigins: x.nearby_origins,
      nearbyDestinations: x.nearby_destinations,
      radiusKm: clampInt(x.radius_km || 300, 0, 2000),
      allowForeignOrigins: x.allow_foreign_origins,
    },
  });
  return {
    query,
    assumptions: x.assumptions.slice(0, 6).map((s) => s.slice(0, 200)),
    questions: x.questions.slice(0, 2).map((s) => s.slice(0, 200)),
    isRefinement: x.is_refinement,
  };
}

/** Salida de la explicación: el LLM NO escribe precios, usa marcadores que rellena el servidor. */
export const LlmExplainSchema = z.object({
  summary: z.string().describe("2-3 frases en español. Precios SOLO con marcadores {precio:F1}, {coste_real:F1}, {ahorro:F3}"),
  picks: z.array(z.object({ ref: z.string(), why: z.string().describe("1-2 frases, sin cifras de precio literales") })),
});
export type LlmExplain = z.infer<typeof LlmExplainSchema>;
