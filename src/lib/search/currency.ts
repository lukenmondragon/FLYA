import "server-only";
import { getStore } from "../db/store";
import { log } from "../log";
import { getCountry } from "../geo/data";

/**
 * Tipos de cambio con base USD. Fuente gratuita sin clave: https://open.er-api.com (ExchangeRate-API, datos diarios).
 * Si falla, se usan tipos aproximados de respaldo (y la UI lo indica).
 */
const FALLBACK_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, MXN: 18.5, GBP: 0.79, JPY: 150, CAD: 1.37, BRL: 5.4, ARS: 1000, COP: 4000, CLP: 930, PEN: 3.75,
  CHF: 0.88, RUB: 92, CNY: 7.2, KRW: 1350, INR: 83, AUD: 1.52, TRY: 33, THB: 36, AED: 3.67, DOP: 59, GTQ: 7.8, UYU: 40,
};

export interface Rates {
  base: "USD";
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
  fallback: boolean;
}

let memo: { at: number; rates: Rates } | undefined;

export async function getRates(): Promise<Rates> {
  if (memo && Date.now() - memo.at < 6 * 3600_000) return memo.rates;
  const store = await getStore();
  const cached = await store.getCache<Rates>("fx:usd");
  if (cached) {
    memo = { at: Date.now(), rates: cached.value };
    return cached.value;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (json.result !== "success" || !json.rates) throw new Error("respuesta inválida");
    const rates: Rates = { base: "USD", rates: json.rates, source: "open.er-api.com", fetchedAt: new Date().toISOString(), fallback: false };
    await store.setCache("fx:usd", rates, 12 * 60);
    memo = { at: Date.now(), rates };
    return rates;
  } catch (e) {
    log.warn("Tipos de cambio no disponibles; usando respaldo aproximado", { error: String(e) });
    const rates: Rates = { base: "USD", rates: FALLBACK_USD, source: "tipos aproximados de respaldo", fetchedAt: new Date().toISOString(), fallback: true };
    memo = { at: Date.now() - 5.5 * 3600_000, rates }; // reintenta pronto
    return rates;
  }
}

export function convert(amount: number, from: string, to: string, rates: Rates): number {
  if (from === to) return amount;
  const f = rates.rates[from.toUpperCase()];
  const t = rates.rates[to.toUpperCase()];
  if (!f || !t) return NaN;
  return (amount / f) * t;
}

/** Moneda por defecto: MXN si el origen es México; si no, la del país de origen; si no, la configurada. */
export function currencyForCountry(cc: string | undefined, fallback: string): string {
  if (!cc) return fallback;
  return getCountry(cc)?.currency ?? fallback;
}

/** Redondeo para mostrar (los precios de vuelos no necesitan decimales). */
export function roundPrice(amount: number): number {
  return Math.round(amount);
}
