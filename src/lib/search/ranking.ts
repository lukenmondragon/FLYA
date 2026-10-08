import type { AnalyzedOffer } from "../schema/flight";
import type { Priority } from "../schema/query";

/** Penalización de comodidad: escalas, esperas largas, noches, cambios de aeropuerto, autoconexión. */
export function comfortPenalty(o: AnalyzedOffer): number {
  let p = o.outbound.stops + (o.inbound?.stops ?? 0);
  for (const t of o.traps) {
    if (t.kind === "long_layover" || t.kind === "overnight_layover") p += 1.5;
    if (t.kind === "airport_change" || t.kind === "self_transfer") p += 2;
    if (t.kind === "tight_connection") p += 1;
    if (t.kind === "many_stops") p += 1;
  }
  return p;
}

/** Penalización de horarios: salidas o llegadas de madrugada. */
export function schedulePenalty(o: AnalyzedOffer): number {
  let p = 0;
  for (const leg of [o.outbound, o.inbound]) {
    if (!leg) continue;
    const hour = Number(leg.departAt.slice(11, 13));
    if (Number.isFinite(hour) && (hour < 6 || hour >= 23)) p += 1;
    const arr = leg.arriveAt ? Number(leg.arriveAt.slice(11, 13)) : NaN;
    if (Number.isFinite(arr) && (arr < 5 || arr >= 24)) p += 0.5;
  }
  return p;
}

const WEIGHTS = [0.6, 0.25, 0.1, 0.05, 0.0];

/**
 * Ordena por las prioridades del usuario (por defecto, precio total real).
 * Cada criterio se normaliza a [0,1] dentro del conjunto y se pondera por orden de prioridad.
 * Si el precio no está entre las prioridades, entra con un peso pequeño para desempatar.
 */
export function rankOffers(offers: AnalyzedOffer[], priorities: Priority[], preferredAirlines: string[] = []): AnalyzedOffer[] {
  if (!offers.length) return offers;
  const prios: Priority[] = priorities.length ? [...priorities] : ["price"];
  if (!prios.includes("price")) prios.push("price");
  const metric: Record<Priority, (o: AnalyzedOffer) => number> = {
    price: (o) => o.realCost,
    duration: (o) => o.totalDurationMin ?? (o.outbound.durationMin ?? 0) * (o.inbound ? 2 : 1),
    comfort: comfortPenalty,
    schedule: schedulePenalty,
    airline: (o) => (preferredAirlines.length && o.airlines.some((a) => preferredAirlines.some((p) => p.toLowerCase() === a.toLowerCase())) ? 0 : 1),
  };
  const ranges = Object.fromEntries(
    prios.map((p) => {
      const vals = offers.map(metric[p]);
      return [p, { min: Math.min(...vals), max: Math.max(...vals) }];
    }),
  ) as Record<Priority, { min: number; max: number }>;
  const scored = offers.map((o) => {
    let score = 0;
    prios.forEach((p, i) => {
      const { min, max } = ranges[p];
      const norm = max > min ? (metric[p](o) - min) / (max - min) : 0;
      score += norm * (WEIGHTS[i] ?? 0.02);
    });
    return { ...o, score: Math.round(score * 1000) / 1000 };
  });
  return scored.sort((a, b) => a.score - b.score || a.realCost - b.realCost);
}
