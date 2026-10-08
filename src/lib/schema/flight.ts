import { z } from "zod";

export const SegmentSchema = z.object({
  from: z.string(),
  to: z.string(),
  departAt: z.string(), // ISO local del proveedor
  arriveAt: z.string().optional(),
  airline: z.string(),
  flightNumber: z.string().optional(),
  durationMin: z.number().optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const LegSchema = z.object({
  from: z.string(),
  to: z.string(),
  departAt: z.string(),
  arriveAt: z.string().optional(),
  durationMin: z.number().optional(),
  stops: z.number().int().min(0),
  /** Tramos detallados si el proveedor los da (el mock sí, Travelpayouts no). */
  segments: z.array(SegmentSchema).default([]),
  /** Escalas: aeropuerto y duración en minutos, si se conocen. */
  layovers: z.array(z.object({ airport: z.string(), minutes: z.number(), changeAirportTo: z.string().optional(), overnight: z.boolean().optional() })).default([]),
});
export type Leg = z.infer<typeof LegSchema>;

/** Esquema único al que se normaliza cualquier proveedor. */
export const FlightOfferSchema = z.object({
  id: z.string(),
  provider: z.string(),
  /** Etiqueta legible de la fuente (p. ej. "Aviasales (Travelpayouts)"). */
  source: z.string(),
  isDemo: z.boolean().default(false),
  airline: z.string(),
  airlines: z.array(z.string()).default([]),
  outbound: LegSchema,
  inbound: LegSchema.optional(),
  /** Duración total (ida + vuelta) en minutos si se conoce. */
  totalDurationMin: z.number().optional(),
  baggageIncluded: z.boolean().nullable().default(null),
  /** Varias aerolíneas sin billete único (autoconexión): sin protección de conexión. */
  selfTransfer: z.boolean().default(false),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  /** Precio original del proveedor antes de convertir moneda. */
  originalPrice: z.number().nonnegative(),
  originalCurrency: z.string().length(3),
  deepLink: z.string().url().optional(),
  fetchedAt: z.string(),
  /** Caducidad orientativa del precio según el proveedor (precios en caché). */
  expiresAt: z.string().optional(),
});
export type FlightOffer = z.infer<typeof FlightOfferSchema>;

export type TrapKind =
  | "long_layover"
  | "overnight_layover"
  | "airport_change"
  | "baggage_not_included"
  | "baggage_unknown"
  | "far_airport"
  | "tight_connection"
  | "self_transfer"
  | "many_stops";

export interface Trap {
  kind: TrapKind;
  label: string;
  detail: string;
  /** Sobrecoste estimado (en la moneda de visualización), si aplica. */
  estimatedExtraCost?: number;
  estimated: boolean;
}

export interface GroundTransfer {
  /** Aeropuerto al que hay que llegar / desde el que hay que salir. */
  airport: string;
  /** Desde/hasta dónde (nombre del lugar del usuario o centro de la ciudad destino). */
  place: string;
  distanceKm: number;
  durationMin: number;
  cost: number;
  currency: string;
  mode: "local" | "bus_tren" | "coche" | "vuelo_domestico";
  /** Siempre true: son estimaciones, no precios de un proveedor. */
  estimated: true;
}

export interface Deal {
  /** % por debajo de la mediana (0.3 = 30 %). */
  belowMedianPct: number;
  median: number;
  sampleSize: number;
  basis: string;
}

/** Oferta enriquecida tras el análisis (lo que ve la UI). */
export interface AnalyzedOffer extends FlightOffer {
  traps: Trap[];
  originTransfer?: GroundTransfer;
  destinationTransfer?: GroundTransfer;
  /** Precio del vuelo + traslados estimados + sobrecostes estimados (equipaje...). */
  realCost: number;
  deal?: Deal;
  /** true si sale/llega a un aeropuerto que el usuario no pidió explícitamente. */
  isAlternative: boolean;
  score: number;
  /** Explicación de 1-2 frases (IA o plantilla). */
  why?: string;
  /** El enlace de compra lleva parámetros de afiliado (se indica en la UI). */
  affiliateLink?: boolean;
  /** Etiqueta corta ("F1", "F2"...) usada para que el LLM cite vuelos. */
  ref: string;
}
