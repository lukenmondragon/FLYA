import type { ResolvedPlace } from "./resolve";
import { airportsNear } from "./resolve";
import { getAirport, getCountry } from "./data";
import { haversineKm } from "./distance";

export interface CandidateAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Distancia en km desde el lugar del usuario. */
  distanceKm: number;
  /** Lugar del usuario del que procede. */
  place: ResolvedPlace;
  /** true si es uno de los aeropuertos que el usuario pidió. */
  requested: boolean;
}

export interface ExpandOptions {
  nearby: boolean;
  radiusKm: number;
  allowForeign: boolean;
  max: number;
  onlyAirports?: string[];
  excludedAirports?: string[];
}

function toCandidate(iata: string, place: ResolvedPlace, requested: boolean): CandidateAirport | undefined {
  const a = getAirport(iata);
  if (!a) return undefined;
  return { iata, name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, distanceKm: Math.round(haversineKm(place.lat, place.lon, a.lat, a.lon)), place, requested };
}

/**
 * Expande lugares a aeropuertos candidatos:
 *  - Siempre incluye los aeropuertos propios del lugar (o la ciudad-área completa).
 *  - Si `nearby`, añade aeropuertos con vuelos regulares dentro del radio, del mismo país
 *    o de países fronterizos (si `allowForeign`), priorizando los grandes y los cercanos.
 *  - Los lugares marcados como `optional` ("Cancún si compensa") entran como alternativas.
 */
export function expandAirports(places: ResolvedPlace[], opts: ExpandOptions): CandidateAirport[] {
  const out = new Map<string, CandidateAirport>();
  const only = new Set(opts.onlyAirports ?? []);
  const excluded = new Set(opts.excludedAirports ?? []);
  const allowed = (iata: string) => (only.size === 0 || only.has(iata)) && !excluded.has(iata);

  for (const p of places) {
    for (const iata of p.airports) {
      if (!allowed(iata) || out.has(iata)) continue;
      const c = toCandidate(iata, p, !p.optional);
      if (c) out.set(iata, c);
    }
  }
  // "Solo Narita": si la restricción nombra aeropuertos no cubiertos, se añaden igualmente.
  for (const iata of only) {
    if (!out.has(iata) && places[0]) {
      const c = toCandidate(iata, places[0], true);
      if (c) out.set(iata, c);
    }
  }

  if (opts.nearby && only.size === 0) {
    const extra: CandidateAirport[] = [];
    for (const p of places.filter((pl) => !pl.optional)) {
      const okCountries = new Set([p.country, ...(opts.allowForeign ? (getCountry(p.country)?.borders ?? []) : [])]);
      for (const { airport, km } of airportsNear(p.lat, p.lon, opts.radiusKm)) {
        if (out.has(airport.iata) || !allowed(airport.iata) || !okCountries.has(airport.country)) continue;
        extra.push({ iata: airport.iata, name: airport.name, city: airport.city, country: airport.country, lat: airport.lat, lon: airport.lon, distanceKm: Math.round(km), place: p, requested: false });
      }
    }
    // Grandes primero, luego por cercanía. Penaliza un poco los extranjeros.
    const rank = (c: CandidateAirport) => {
      const ap = getAirport(c.iata);
      return c.distanceKm * (ap?.size === "L" ? 0.6 : 1) * (c.country === c.place.country ? 1 : 1.3);
    };
    extra.sort((a, b) => rank(a) - rank(b));
    for (const c of extra) {
      if (out.size >= opts.max) break;
      if (!out.has(c.iata)) out.set(c.iata, c);
    }
  }

  // Requeridos primero; recorta al máximo sin perder ninguno pedido explícitamente.
  const all = [...out.values()].sort((a, b) => Number(b.requested) - Number(a.requested) || a.distanceKm - b.distanceKm);
  const requested = all.filter((c) => c.requested);
  const rest = all.filter((c) => !c.requested);
  return [...requested, ...rest].slice(0, Math.max(opts.max, requested.length));
}
