import "server-only";
import { env } from "../env";
import { MockProvider } from "./mock";
import { TravelpayoutsProvider } from "./travelpayouts";
import type { FlightProvider } from "./types";

/**
 * Registro de proveedores. Para añadir uno nuevo: implementa FlightProvider en un archivo
 * de esta carpeta y añádelo aquí con su variable FLIGHT_PROVIDER.
 */
export function getFlightProvider(): FlightProvider {
  const e = env();
  const wantsReal = e.FLIGHT_PROVIDER === "travelpayouts" || (e.FLIGHT_PROVIDER === "auto" && !!e.TRAVELPAYOUTS_TOKEN);
  if (wantsReal && e.TRAVELPAYOUTS_TOKEN) {
    return new TravelpayoutsProvider(e.TRAVELPAYOUTS_TOKEN, { linkHost: e.TRAVELPAYOUTS_LINK_HOST, market: e.TRAVELPAYOUTS_MARKET });
  }
  return new MockProvider();
}

export type { FlightProvider } from "./types";
