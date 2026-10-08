import type { FlightOffer, Leg, Segment } from "../schema/flight";
import { getAirport, type Airport } from "../geo/data";
import { haversineKm } from "../geo/distance";
import { findMetroByAirport } from "../geo/metros";
import { addDays, daysInMonth, diffDays } from "../util/dates";
import { hash, rng } from "../util/text";
import { isLowCost } from "./airlines";
import type { FlightProvider, ProviderRequest } from "./types";

/**
 * Proveedor de DEMOSTRACIÓN: datos sintéticos deterministas (misma consulta → mismos resultados).
 * Sirve para que la app funcione sin claves. Nunca debe confundirse con precios reales: isDemo = true.
 */

const CARRIERS: Record<string, string[]> = {
  MX: ["AM", "Y4", "VB"], US: ["AA", "UA", "DL"], CA: ["AC", "WS"], JP: ["JL", "NH", "ZG"], ES: ["IB", "VY", "UX"], FR: ["AF", "TO"],
  GB: ["BA", "U2", "VS"], DE: ["LH", "EW"], IT: ["AZ", "FR"], PT: ["TP"], NL: ["KL"], KR: ["KE", "OZ"], CN: ["CA", "MU"], BR: ["LA", "G3"],
  AR: ["AR"], CO: ["AV"], PE: ["LA"], CL: ["LA", "JA"], TR: ["TK", "PC"], AE: ["EK"], QA: ["QR"], TH: ["TG"], AU: ["QF"],
};
const GLOBAL = ["TK", "QR", "LH", "KL", "AF"];

const HUBS = ["LAX", "SFO", "DFW", "IAH", "ORD", "YVR", "JFK", "ATL", "MAD", "CDG", "AMS", "FRA", "LHR", "IST", "DOH", "DXB", "ICN", "PTY", "BOG", "MEX", "HKG", "SIN", "MUC", "ZRH", "LIS"];

function tzOffsetMin(a: Airport): number {
  return Math.round(a.lon / 15) * 60;
}

function iso(dateISO: string, minutesFromMidnight: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutesFromMidnight);
  return d.toISOString().slice(0, 16);
}

function flightMin(a: Airport, b: Airport): number {
  return Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) / 800 * 60 + 35);
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

function buildLeg(r: () => number, from: Airport, to: Airport, date: string, carrier: string, stopsWanted: number, partner: string): { leg: Leg; airlines: string[]; selfTransfer: boolean } {
  const depMin = Math.floor(r() * 18 * 60) + 6 * 60 - (r() < 0.15 ? 6 * 60 : 0); // casi siempre de día, a veces de madrugada
  if (stopsWanted === 0) {
    const dur = flightMin(from, to);
    const arrUtc = depMin - tzOffsetMin(from) + dur;
    const seg: Segment = { from: from.iata, to: to.iata, departAt: iso(date, depMin), arriveAt: iso(date, arrUtc + tzOffsetMin(to)), airline: carrier, flightNumber: `${carrier}${100 + Math.floor(r() * 899)}`, durationMin: dur };
    return { leg: { from: from.iata, to: to.iata, departAt: seg.departAt, arriveAt: seg.arriveAt, durationMin: dur, stops: 0, segments: [seg], layovers: [] }, airlines: [carrier], selfTransfer: false };
  }
  // Una escala: hub con menor rodeo.
  const direct = haversineKm(from.lat, from.lon, to.lat, to.lon);
  const hubs = HUBS.map(getAirport)
    .filter((h): h is Airport => !!h && h.iata !== from.iata && h.iata !== to.iata)
    .map((h) => ({ h, detour: (haversineKm(from.lat, from.lon, h.lat, h.lon) + haversineKm(h.lat, h.lon, to.lat, to.lon)) / Math.max(direct, 1) }))
    .sort((a, b) => a.detour - b.detour)
    .slice(0, 3);
  const hub = pick(r, hubs).h;
  const d1 = flightMin(from, hub);
  const d2 = flightMin(hub, to);
  const roll = r();
  const layover = roll < 0.65 ? 80 + Math.floor(r() * 160) : roll < 0.87 ? 240 + Math.floor(r() * 240) : 480 + Math.floor(r() * 420);
  const tight = r() < 0.07;
  const lay = tight ? 50 + Math.floor(r() * 15) : layover;
  const arr1Local = depMin - tzOffsetMin(from) + d1 + tzOffsetMin(hub);
  const dep2Local = arr1Local + lay;
  const arr2Local = dep2Local - tzOffsetMin(hub) + d2 + tzOffsetMin(to);
  // ¿La escala pasa por la madrugada (00:00-05:00 hora local del hub)?
  const startH = ((arr1Local % 1440) + 1440) % 1440;
  const overnight = lay >= 180 && (startH >= 20 * 60 || startH + lay >= 24 * 60 + 60 || startH < 4 * 60);
  // Cambio de aeropuerto dentro de la misma ciudad (p. ej. llegar a LGW y salir de LHR).
  const metro = findMetroByAirport(hub.iata);
  const changeTo = metro && metro.airports.length > 1 && r() < 0.25 ? metro.airports.find((x) => x !== hub.iata) : undefined;
  const second = partner;
  const segs: Segment[] = [
    { from: from.iata, to: hub.iata, departAt: iso(date, depMin), arriveAt: iso(date, arr1Local), airline: carrier, flightNumber: `${carrier}${100 + Math.floor(r() * 899)}`, durationMin: d1 },
    { from: changeTo ?? hub.iata, to: to.iata, departAt: iso(date, dep2Local), arriveAt: iso(date, arr2Local), airline: second, flightNumber: `${second}${100 + Math.floor(r() * 899)}`, durationMin: d2 },
  ];
  const total = d1 + lay + d2 + (changeTo ? 90 : 0);
  const selfTransfer = second !== carrier && (isLowCost(carrier) || isLowCost(second)) && r() < 0.6;
  return {
    leg: { from: from.iata, to: to.iata, departAt: segs[0]!.departAt, arriveAt: segs[1]!.arriveAt, durationMin: total, stops: 1, segments: segs, layovers: [{ airport: hub.iata, minutes: lay, changeAirportTo: changeTo, overnight }] },
    airlines: [...new Set([carrier, second])],
    selfTransfer,
  };
}

export class MockProvider implements FlightProvider {
  readonly id = "mock";
  readonly label = "Datos de demostración";
  readonly isDemo = true;
  readonly supportsCityCodes = false;
  readonly supportsAnywhere = false;
  readonly coverageNote = "Precios sintéticos generados para probar la aplicación. No son reales.";

  async search(req: ProviderRequest): Promise<FlightOffer[]> {
    const from = getAirport(req.origin);
    const to = req.destination ? getAirport(req.destination) : undefined;
    if (!from || !to || from.iata === to.iata) return [];
    const dist = haversineKm(from.lat, from.lon, to.lat, to.lon);
    if (dist < 80) return [];
    const days = req.departure.length === 7 ? daysInMonth(req.departure) : [req.departure];
    const carriers = [...new Set([...(CARRIERS[from.country] ?? []), ...(CARRIERS[to.country] ?? []), ...GLOBAL])];
    const out: FlightOffer[] = [];
    const fetchedAt = new Date().toISOString();
    // Aeropuertos pequeños tienen menos rutas y precios algo más altos.
    const sizeFactor = (from.size === "L" ? 1 : 1.12) * (to.size === "L" ? 1 : 1.08);

    for (const day of days) {
      const r = rng(hash(`${from.iata}|${to.iata}|${day}|${req.return ?? ""}|${req.oneWay}`));
      const n = 1 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const carrier = pick(r, carriers);
        const partner = r() < 0.5 ? carrier : pick(r, carriers);
        const directPossible = dist < 1800 || (from.size === "L" && to.size === "L" && dist < 12500 && hash(`${from.iata}${to.iata}`) % 3 !== 0);
        const stops = req.directOnly ? 0 : directPossible && r() < 0.45 ? 0 : 1;
        if (stops === 0 && !directPossible) continue;
        const out1 = buildLeg(r, from, to, day, carrier, stops, partner);
        let inbound: Leg | undefined;
        let airlines = out1.airlines;
        let selfTransfer = out1.selfTransfer;
        if (!req.oneWay) {
          let ret: string;
          if (req.return && req.return.length === 10) ret = req.return;
          else {
            ret = addDays(day, 6 + Math.floor(r() * 10));
            if (req.return && req.return.length === 7 && ret.slice(0, 7) > req.return) continue;
          }
          if (diffDays(day, ret) < 1) continue;
          const back = buildLeg(r, to, from, ret, carrier, stops, partner);
          inbound = back.leg;
          airlines = [...new Set([...airlines, ...back.airlines])];
          selfTransfer = selfTransfer || back.selfTransfer;
        }
        const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
        let usd = (110 + dist * 0.105) * (req.oneWay ? 0.62 : 1);
        usd *= 0.9 + r() * 0.25; // ruido
        usd *= wd === 5 || wd === 0 ? 1.12 : 1;
        usd *= isLowCost(carrier) ? 0.9 : 1;
        usd *= stops === 0 ? 1.18 : 1;
        usd *= sizeFactor;
        if (r() < 0.03) usd *= 0.65; // chollo ocasional
        const price = Math.round(usd * req.adults);
        const lowCost = airlines.some(isLowCost);
        const baggage = lowCost ? false : dist > 4000 ? r() < 0.75 : r() < 0.45;
        const id = `mock-${from.iata}-${to.iata}-${day}-${k}-${hash(JSON.stringify(out1.leg.segments)) % 100000}`;
        out.push({
          id,
          provider: this.id,
          source: this.label,
          isDemo: true,
          airline: carrier,
          airlines,
          outbound: out1.leg,
          inbound,
          totalDurationMin: (out1.leg.durationMin ?? 0) + (inbound?.durationMin ?? 0),
          baggageIncluded: baggage,
          selfTransfer,
          price,
          currency: "USD",
          originalPrice: price,
          originalCurrency: "USD",
          deepLink: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from.iata} to ${to.iata} on ${day}${inbound ? ` through ${inbound.departAt.slice(0, 10)}` : " one way"}`)}`,
          fetchedAt,
        });
      }
    }
    return out.sort((a, b) => a.price - b.price).slice(0, 40);
  }
}
