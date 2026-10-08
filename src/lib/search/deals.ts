import type { Deal } from "../schema/flight";

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export const DEAL_THRESHOLD = 0.3; // 30 % por debajo de la mediana
export const MIN_SAMPLES = 8;

/**
 * ¿Es un chollo? Compara el precio con la mediana de los precios de referencia de la ruta y mes.
 * Las referencias son el MÍNIMO de cada día de salida (como un calendario de precios): así se compara
 * con "lo barato normal" de la ruta y no con todo el abanico de tarifas.
 * Fuentes: histórico propio en la base de datos + resultados de esta búsqueda. Todo en la misma moneda.
 */
export function computeDeal(price: number, samples: number[], basis: string): Deal | undefined {
  if (samples.length < MIN_SAMPLES) return undefined;
  const med = median(samples);
  if (!Number.isFinite(med) || med <= 0) return undefined;
  const below = (med - price) / med;
  if (below < DEAL_THRESHOLD) return undefined;
  return { belowMedianPct: Math.round(below * 100) / 100, median: Math.round(med), sampleSize: samples.length, basis };
}

/** Mínimo por fecha de salida (referencias para computeDeal). */
export function dailyMinimums<T>(items: T[], date: (x: T) => string, price: (x: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(date(it), Math.min(m.get(date(it)) ?? Infinity, price(it)));
  return m;
}
