import type { GroundTransfer } from "../schema/flight";
import { haversineKm } from "./distance";

/**
 * Estimación MUY aproximada del traslado terrestre entre un lugar y un aeropuerto.
 * No procede de ningún proveedor: se marca siempre como estimación en la UI.
 * Costes de referencia en USD por persona (transporte público / autobús de larga distancia).
 */
const ROAD_FACTOR = 1.3; // la carretera no va en línea recta

export function estimateTransfer(place: { label: string; lat: number; lon: number }, airport: { iata: string; lat: number; lon: number }, region?: string): Omit<GroundTransfer, "currency"> & { costUsd: number } {
  const straight = haversineKm(place.lat, place.lon, airport.lat, airport.lon);
  const km = Math.round(straight * ROAD_FACTOR);
  let mode: GroundTransfer["mode"];
  let durationMin: number;
  let costUsd: number;
  const europe = region === "Europe";
  if (km <= 35) {
    mode = "local";
    durationMin = 25 + km * 1.2;
    costUsd = europe ? 6 : 5 + km * 0.15;
  } else if (km <= 700) {
    mode = "bus_tren";
    durationMin = 30 + (km / 75) * 60;
    costUsd = (europe ? 8 : 6) + km * (europe ? 0.11 : 0.08);
  } else {
    mode = "vuelo_domestico";
    durationMin = 120 + (straight / 700) * 60;
    costUsd = 55 + straight * 0.07;
  }
  return { airport: airport.iata, place: place.label, distanceKm: km, durationMin: Math.round(durationMin / 5) * 5, cost: 0, costUsd: Math.round(costUsd), mode, estimated: true };
}
