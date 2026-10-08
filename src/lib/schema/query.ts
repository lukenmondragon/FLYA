import { z } from "zod";

/** Un lugar tal y como lo menciona el usuario. La resolución a aeropuertos la hace el servidor. */
export const PlaceRefSchema = z.object({
  /** Texto del lugar ("CDMX", "Getaria", "Tokio", "NRT"). */
  name: z.string().min(1).max(80),
  /** País ISO-3166 alfa-2 si se conoce ("ES", "MX"). */
  country: z.string().length(2).optional(),
  /** Códigos IATA concretos si el usuario los nombra o el LLM los conoce con certeza. */
  iata: z.array(z.string().regex(/^[A-Z]{3}$/)).max(8).optional(),
  /** Coordenadas aproximadas (solo para geolocalizar lugares pequeños; nunca para precios). */
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  /** true = "solo si compensa" (p. ej. "Cancún si el precio lo permite"): se muestra como alternativa. */
  optional: z.boolean().optional(),
});
export type PlaceRef = z.infer<typeof PlaceRefSchema>;

export const PrioritySchema = z.enum(["price", "duration", "comfort", "schedule", "airline"]);
export type Priority = z.infer<typeof PrioritySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/);

export const DateSpecSchema = z.object({
  /** Fecha exacta YYYY-MM-DD. */
  date: isoDate.optional(),
  /** Mes completo YYYY-MM (cuando el usuario dice "en marzo"). */
  month: isoMonth.optional(),
  /** Flexibilidad en días alrededor de `date` (±N). */
  flexDays: z.number().int().min(0).max(7).default(0),
});
export type DateSpec = z.infer<typeof DateSpecSchema>;

export const SearchQuerySchema = z.object({
  origins: z.array(PlaceRefSchema).max(6),
  /** Vacío + destinationMode "anywhere" = "a cualquier sitio". */
  destinations: z.array(PlaceRefSchema).max(6),
  destinationMode: z.enum(["specific", "anywhere"]).default("specific"),
  /** Etiquetas para destinos abiertos: "calido", "playa", "nieve", "ciudad", "europa"... */
  destinationTags: z.array(z.string().max(20)).max(5).default([]),
  tripType: z.enum(["roundtrip", "oneway"]).default("roundtrip"),
  departure: DateSpecSchema,
  /** Para ida y vuelta: fecha/mes de vuelta o duración de la estancia. */
  return: DateSpecSchema.optional(),
  stayDays: z.object({ min: z.number().int().min(1).max(60), max: z.number().int().min(1).max(90) }).optional(),
  longWeekends: z.boolean().default(false),
  passengers: z
    .object({
      adults: z.number().int().min(1).max(9).default(1),
      children: z.number().int().min(0).max(8).default(0),
      infants: z.number().int().min(0).max(4).default(0),
    })
    .default({ adults: 1, children: 0, infants: 0 }),
  budget: z.object({ amount: z.number().positive(), currency: z.string().length(3) }).optional(),
  /** Moneda en la que mostrar precios (ISO 4217). Si falta, se deduce del origen. */
  currency: z.string().length(3).optional(),
  priorities: z.array(PrioritySchema).max(5).default(["price"]),
  constraints: z
    .object({
      directOnly: z.boolean().default(false),
      maxStops: z.number().int().min(0).max(3).optional(),
      maxLayoverHours: z.number().min(1).max(48).optional(),
      baggageIncluded: z.boolean().default(false),
      avoidOvernightLayovers: z.boolean().default(false),
      preferredAirlines: z.array(z.string().max(40)).max(5).default([]),
      excludedAirlines: z.array(z.string().max(40)).max(5).default([]),
      /** Restringe a estos aeropuertos IATA (p. ej. "solo Narita" → ["NRT"]). */
      onlyAirports: z.array(z.string().regex(/^[A-Z]{3}$/)).max(10).default([]),
      excludedAirports: z.array(z.string().regex(/^[A-Z]{3}$/)).max(10).default([]),
    })
    .default({
      directOnly: false,
      baggageIncluded: false,
      avoidOvernightLayovers: false,
      preferredAirlines: [],
      excludedAirlines: [],
      onlyAirports: [],
      excludedAirports: [],
    }),
  flexibility: z
    .object({
      nearbyOrigins: z.boolean().default(true),
      nearbyDestinations: z.boolean().default(false),
      radiusKm: z.number().int().min(0).max(2000).default(300),
      /** Permitir aeropuertos de países vecinos (p. ej. EE. UU. desde México). */
      allowForeignOrigins: z.boolean().default(true),
    })
    .default({ nearbyOrigins: true, nearbyDestinations: false, radiusKm: 300, allowForeignOrigins: true }),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchQueryInput = z.input<typeof SearchQuerySchema>;

/** Resultado del intérprete (LLM o reglas). */
export const ParseResultSchema = z.object({
  query: SearchQuerySchema,
  /** Supuestos razonables que se han hecho y se muestran al usuario. */
  assumptions: z.array(z.string().max(200)).max(6).default([]),
  /** Preguntas imprescindibles (máximo 2). Si hay alguna, no se busca todavía. */
  questions: z.array(z.string().max(200)).max(2).default([]),
  isRefinement: z.boolean().default(false),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;
