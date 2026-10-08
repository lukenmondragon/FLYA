import type { FlightOffer, GroundTransfer, Trap } from "../schema/flight";
import { getAirport } from "../geo/data";
import { haversineKm } from "../geo/distance";

export interface TrapContext {
  /** Convierte USD a la moneda de visualización. */
  fromUsd: (usd: number) => number;
  destinationTransfer?: GroundTransfer;
  /** El usuario exige maleta incluida. */
  wantsBaggage: boolean;
  passengers: number;
}

const LONG_LAYOVER_MIN = 6 * 60;
const TIGHT_CONNECTION_MIN = 60;
const FAR_AIRPORT_KM = 40;

/** Duración estimada de un vuelo directo (para inferir escalas largas cuando el proveedor no da tramos). */
export function estimatedDirectMin(from: string, to: string): number | undefined {
  const a = getAirport(from);
  const b = getAirport(to);
  if (!a || !b) return undefined;
  return Math.round((haversineKm(a.lat, a.lon, b.lat, b.lon) / 800) * 60 + 35);
}

function legDistanceKm(from: string, to: string): number {
  const a = getAirport(from);
  const b = getAirport(to);
  return a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : 0;
}

function h(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

/**
 * Detecta "trampas" de una oferta. Los sobrecostes son ESTIMACIONES (se marcan como tales).
 */
export function detectTraps(o: FlightOffer, ctx: TrapContext): Trap[] {
  const traps: Trap[] = [];
  const legs = [o.outbound, ...(o.inbound ? [o.inbound] : [])];

  for (const leg of legs) {
    if (leg.layovers.length) {
      for (const l of leg.layovers) {
        if (l.minutes > LONG_LAYOVER_MIN) {
          traps.push({ kind: "long_layover", label: "Escala larga", detail: `${h(l.minutes)} en ${l.airport}`, estimated: false, estimatedExtraCost: Math.round(ctx.fromUsd(l.minutes > 10 * 60 ? 25 : 12) * ctx.passengers) });
        }
        if (l.overnight) {
          traps.push({ kind: "overnight_layover", label: "Escala nocturna", detail: `Noche en ${l.airport}${l.minutes > 8 * 60 ? " (quizá necesites hotel)" : ""}`, estimated: true, estimatedExtraCost: l.minutes > 8 * 60 ? Math.round(ctx.fromUsd(90) * Math.ceil(ctx.passengers / 2)) : undefined });
        }
        if (l.changeAirportTo) {
          traps.push({ kind: "airport_change", label: "Cambio de aeropuerto", detail: `Llegas a ${l.airport} y sales de ${l.changeAirportTo}`, estimated: true, estimatedExtraCost: Math.round(ctx.fromUsd(30) * ctx.passengers) });
          if (l.minutes < 180) traps.push({ kind: "tight_connection", label: "Conexión justa", detail: `Solo ${h(l.minutes)} para cambiar de aeropuerto`, estimated: false });
        } else if (l.minutes < TIGHT_CONNECTION_MIN) {
          traps.push({ kind: "tight_connection", label: "Conexión justa", detail: `${h(l.minutes)} en ${l.airport}`, estimated: false });
        }
      }
    } else if (leg.stops > 0 && leg.durationMin) {
      // Sin detalle de tramos: inferimos la espera comparando con un vuelo directo teórico.
      const direct = estimatedDirectMin(leg.from, leg.to);
      if (direct) {
        const waiting = leg.durationMin - direct * 1.1 - 30 * leg.stops;
        if (waiting > LONG_LAYOVER_MIN) {
          traps.push({ kind: "long_layover", label: "Escala probablemente larga", detail: `~${h(Math.round(waiting / 30) * 30)} de espera (estimado por la duración total)`, estimated: true });
        }
      }
    }
    if (leg.stops >= 2) traps.push({ kind: "many_stops", label: `${leg.stops} escalas`, detail: `${leg.from}→${leg.to} con ${leg.stops} escalas`, estimated: false });
  }

  if (o.selfTransfer) {
    traps.push({ kind: "self_transfer", label: "Sin protección de conexión", detail: "Billetes separados de varias aerolíneas: si pierdes un vuelo, el siguiente no te espera", estimated: false });
  }

  const longHaul = legDistanceKm(o.outbound.from, o.outbound.to) > 3000;
  const bagUsd = (longHaul ? 70 : 40) * legs.length * ctx.passengers;
  if (o.baggageIncluded === false) {
    traps.push({ kind: "baggage_not_included", label: "Maleta no incluida", detail: "Facturar suele costar extra", estimated: true, estimatedExtraCost: Math.round(ctx.fromUsd(bagUsd)) });
  } else if (o.baggageIncluded === null) {
    traps.push({ kind: "baggage_unknown", label: "Equipaje sin confirmar", detail: "La fuente no indica si incluye maleta facturada", estimated: true, estimatedExtraCost: ctx.wantsBaggage ? Math.round(ctx.fromUsd(bagUsd / 2)) : undefined });
  }

  const t = ctx.destinationTransfer;
  if (t && t.distanceKm > FAR_AIRPORT_KM) {
    traps.push({ kind: "far_airport", label: "Aeropuerto lejano", detail: `${t.airport} está a ~${t.distanceKm} km de ${t.place} (~${h(t.durationMin)})`, estimated: true, estimatedExtraCost: Math.round(t.cost * 2) });
  }
  return traps;
}

/** Suma de sobrecostes estimados (sin contar el traslado lejano, que ya va en el coste de traslado). */
export function trapExtraCost(traps: Trap[]): number {
  return traps.filter((t) => t.kind !== "far_airport").reduce((s, t) => s + (t.estimatedExtraCost ?? 0), 0);
}
