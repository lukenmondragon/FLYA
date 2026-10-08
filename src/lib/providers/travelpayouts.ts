import "server-only";
import { z } from "zod";
import type { FlightOffer, Leg } from "../schema/flight";
import { HttpError, withRetry } from "../util/async";
import type { FlightProvider, ProviderRequest } from "./types";
import { ProviderError } from "./types";

/**
 * Aviasales Data API (Travelpayouts), endpoint v3 `prices_for_dates`.
 * Devuelve precios EN CACHÉ de búsquedas reales hechas en Aviasales en los últimos días (no es disponibilidad en vivo).
 * Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
 */
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

const TicketSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  origin_airport: z.string().optional(),
  destination_airport: z.string().optional(),
  price: z.number(),
  airline: z.string().default(""),
  flight_number: z.union([z.string(), z.number()]).optional(),
  departure_at: z.string(),
  return_at: z.string().optional().nullable(),
  transfers: z.number().default(0),
  return_transfers: z.number().optional().nullable(),
  duration: z.number().optional().nullable(),
  duration_to: z.number().optional().nullable(),
  duration_back: z.number().optional().nullable(),
  link: z.string().optional(),
});

const ResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(TicketSchema).default([]),
  currency: z.string().optional(),
  error: z.string().optional().nullable(),
});

export type TravelpayoutsTicket = z.infer<typeof TicketSchema>;

/** "2027-03-04T10:25:00+09:00" → "2027-03-04T10:25" (hora local del aeropuerto). */
function localISO(s: string): string {
  return s.slice(0, 16);
}

/** Normaliza un billete de Travelpayouts al esquema único. Exportado para tests. */
export function normalizeTravelpayouts(t: TravelpayoutsTicket, currency: string, opts: { linkHost: string; fetchedAt: string }): FlightOffer {
  const from = t.origin_airport || t.origin;
  const to = t.destination_airport || t.destination;
  const outbound: Leg = {
    from,
    to,
    departAt: localISO(t.departure_at),
    durationMin: t.duration_to ?? undefined,
    stops: t.transfers,
    segments: [],
    layovers: [],
  };
  const inbound: Leg | undefined = t.return_at
    ? {
        from: to,
        to: from,
        departAt: localISO(t.return_at),
        durationMin: t.duration_back ?? undefined,
        stops: t.return_transfers ?? t.transfers,
        segments: [],
        layovers: [],
      }
    : undefined;
  const cur = currency.toUpperCase();
  return {
    id: `tp-${from}-${to}-${t.departure_at}-${t.return_at ?? "ow"}-${t.airline}${t.flight_number ?? ""}-${t.price}`,
    provider: "travelpayouts",
    source: "Aviasales (Travelpayouts)",
    isDemo: false,
    airline: t.airline,
    airlines: t.airline ? [t.airline] : [],
    outbound,
    inbound,
    totalDurationMin: t.duration ?? ((t.duration_to ?? 0) + (t.duration_back ?? 0) || undefined),
    baggageIncluded: null, // la API de precios en caché no informa del equipaje
    selfTransfer: false,
    price: t.price,
    currency: cur,
    originalPrice: t.price,
    originalCurrency: cur,
    deepLink: t.link ? `https://${opts.linkHost}${t.link.startsWith("/") ? "" : "/"}${t.link}` : undefined,
    fetchedAt: opts.fetchedAt,
  };
}

export class TravelpayoutsProvider implements FlightProvider {
  readonly id = "travelpayouts";
  readonly label = "Aviasales (Travelpayouts)";
  readonly isDemo = false;
  readonly supportsCityCodes = true;
  readonly supportsAnywhere = true;
  readonly coverageNote =
    "Precios en caché de búsquedas recientes en Aviasales (hasta ~7 días). Algunas low cost o rutas poco buscadas pueden no aparecer: conviene comprobarlas en la web de la aerolínea.";

  constructor(
    private token: string,
    private opts: { linkHost: string; market?: string },
  ) {}

  async search(req: ProviderRequest): Promise<FlightOffer[]> {
    const params = new URLSearchParams({
      origin: req.origin,
      departure_at: req.departure,
      one_way: String(req.oneWay),
      direct: String(req.directOnly),
      currency: req.currency.toLowerCase(),
      sorting: "price",
      unique: "false",
      limit: "100",
      page: "1",
    });
    if (req.destination) params.set("destination", req.destination);
    if (!req.oneWay && req.return) params.set("return_at", req.return);
    if (this.opts.market) params.set("market", this.opts.market);

    const json = await withRetry(async () => {
      const res = await fetch(`${API}?${params}`, {
        headers: { "X-Access-Token": this.token, "Accept-Encoding": "gzip, deflate" },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new HttpError(res.status, `Travelpayouts HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    }).catch((e: unknown) => {
      if (e instanceof HttpError && e.status === 401) throw new ProviderError(this.id, "Token de Travelpayouts inválido (401).");
      if (e instanceof HttpError && e.status === 429) throw new ProviderError(this.id, "Límite de peticiones de Travelpayouts alcanzado (429).", true);
      throw new ProviderError(this.id, `Travelpayouts no responde: ${e instanceof Error ? e.message : String(e)}`, true);
    });

    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new ProviderError(this.id, "Respuesta inesperada de Travelpayouts.");
    if (!parsed.data.success) throw new ProviderError(this.id, parsed.data.error || "Travelpayouts devolvió un error.");
    const currency = parsed.data.currency ?? req.currency;
    const fetchedAt = new Date().toISOString();
    return parsed.data.data.map((t) => normalizeTravelpayouts(t, currency, { linkHost: this.opts.linkHost, fetchedAt }));
  }
}
