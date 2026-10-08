import type { AnalyzedOffer } from "./flight";
import type { SearchQuery } from "./query";

/** Tipos compartidos entre servidor y cliente (sin dependencias de servidor). */

export interface DatePrice {
  date: string;
  price: number;
  /** Diferencia con la fecha elegida (negativa = más barata). */
  delta?: number;
}

export interface AirportSummary {
  iata: string;
  name: string;
  city: string;
  country: string;
  distanceKm: number;
  requested: boolean;
  /** Mejor precio real encontrado desde/hasta este aeropuerto. */
  bestRealCost?: number;
}

export interface SearchOutcome {
  query: SearchQuery;
  currency: string;
  provider: { id: string; label: string; isDemo: boolean; coverageNote?: string };
  /** Lo que el usuario pidió. */
  primary: AnalyzedOffer[];
  /** Alternativas que pueden ahorrar dinero (otros aeropuertos), solo si compensan. */
  alternatives: AnalyzedOffer[];
  origins: AirportSummary[];
  destinations: AirportSummary[];
  /** Precio más barato por fecha de salida alrededor de la fecha elegida (±3 días) o en el mes. */
  dateMatrix: DatePrice[];
  /** Mensajes informativos (sin resultados, presupuesto, cobertura...). */
  notices: string[];
  fx: { source: string; fallback: boolean };
  fetchedAt: string;
  stats: { providerCalls: number; cacheHits: number; offersSeen: number; ms: number };
}

export type ChatEvent =
  | { type: "status"; message: string }
  | { type: "parsed"; query: SearchQuery; assumptions: string[]; isRefinement: boolean; parser: string }
  | { type: "question"; questions: string[]; query: SearchQuery }
  | { type: "progress"; done: number; total: number; message: string }
  | { type: "results"; outcome: SearchOutcome }
  | { type: "explanation"; text: string; reasons: Record<string, string>; source: "llm" | "plantilla" }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatRequestBody {
  message: string;
  /** Consulta estructurada anterior (para refinar sin empezar de cero). */
  previousQuery?: SearchQuery;
  /** Últimos mensajes del usuario (contexto mínimo). */
  history?: string[];
}
