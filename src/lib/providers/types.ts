import type { FlightOffer } from "../schema/flight";

export interface ProviderRequest {
  /** IATA de aeropuerto o de ciudad (si el proveedor admite códigos de ciudad). */
  origin: string;
  /** Vacío = "a cualquier sitio" (si el proveedor lo admite). */
  destination?: string;
  /** Mes YYYY-MM o fecha YYYY-MM-DD. */
  departure: string;
  /** Mes YYYY-MM o fecha YYYY-MM-DD (solo ida y vuelta). */
  return?: string;
  oneWay: boolean;
  directOnly: boolean;
  adults: number;
  /** Moneda solicitada al proveedor (luego se convierte igualmente). */
  currency: string;
  /** País del usuario (ISO2 en minúsculas): algunos proveedores tienen datos por mercado. */
  market?: string;
}

export interface FlightProvider {
  readonly id: string;
  /** Nombre visible de la fuente. */
  readonly label: string;
  /** true = datos sintéticos de demostración. */
  readonly isDemo: boolean;
  /** Admite códigos de ciudad (TYO, LON) y devuelve el aeropuerto concreto en cada oferta. */
  readonly supportsCityCodes: boolean;
  /** Admite búsquedas sin destino ("a cualquier sitio"). */
  readonly supportsAnywhere: boolean;
  /** Nota de cobertura que se muestra al usuario (p. ej. low cost no cubiertas). */
  readonly coverageNote?: string;
  /** Busca y devuelve ofertas YA normalizadas al esquema único (en la moneda del proveedor). */
  search(req: ProviderRequest): Promise<FlightOffer[]>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
