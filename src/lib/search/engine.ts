import "server-only";
import type { AnalyzedOffer, FlightOffer, GroundTransfer } from "../schema/flight";
import type { SearchQuery } from "../schema/query";
import type { AirportSummary, DatePrice, SearchOutcome } from "../schema/api";
import { env } from "../env";
import { log, type SearchMetrics } from "../log";
import { getStore, type PriceObservation } from "../db/store";
import { resolvePlace, type ResolvedPlace } from "../geo/resolve";
import { expandAirports, type CandidateAirport } from "../geo/expand";
import { getAirport, getCountry } from "../geo/data";
import { findMetroByAirport } from "../geo/metros";
import { estimateTransfer } from "../geo/transfer";
import { haversineKm } from "../geo/distance";
import type { Airport } from "../geo/data";
import { getFlightProvider, type FlightProvider } from "../providers";
import type { ProviderRequest } from "../providers/types";
import { ProviderError } from "../providers/types";
import { mapLimit } from "../util/async";
import { addDays, diffDays, monthOf, nextMonthOccurrence, todayISO, weekday } from "../util/dates";
import { hash } from "../util/text";
import { convert, currencyForCountry, getRates, roundPrice, type Rates } from "./currency";
import { detectTraps, trapExtraCost } from "./traps";
import { computeDeal, dailyMinimums } from "./deals";
import { rankOffers } from "./ranking";
import { pickInspiration } from "./inspiration";
import { purchaseLink } from "./affiliate";

export interface EngineHooks {
  onProgress?: (done: number, total: number, message: string) => void;
  onStatus?: (message: string) => void;
}

/** Súbelo si cambia el formato normalizado de las ofertas (invalida la caché). */
const CACHE_VERSION = 2;

export class SearchError extends Error {}

interface Call {
  req: ProviderRequest;
  requested: boolean;
  label: string;
}

/** Ventana de fechas de salida aceptadas y meses a consultar. */
export function departureWindow(q: SearchQuery, now = new Date()): { from: string; to: string; months: string[]; anchor?: string } {
  const today = todayISO(now);
  if (q.departure.date) {
    const flex = Math.max(q.departure.flexDays, 0);
    const from = addDays(q.departure.date, -flex) < today ? today : addDays(q.departure.date, -flex);
    const to = addDays(q.departure.date, flex);
    const months = [...new Set([monthOf(from), monthOf(to)])];
    return { from, to, months, anchor: q.departure.date };
  }
  const month = q.departure.month ?? nextMonthOccurrence(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2, now);
  const from = `${month}-01` < today ? today : `${month}-01`;
  return { from, to: `${month}-31`, months: [month] };
}

function stayRange(q: SearchQuery): { min: number; max: number } | undefined {
  if (q.longWeekends) return { min: 2, max: 4 };
  return q.stayDays;
}

function offerMatches(o: FlightOffer, q: SearchQuery, win: { from: string; to: string }): boolean {
  const dep = o.outbound.departAt.slice(0, 10);
  if (dep < win.from || dep > win.to) return false;
  const c = q.constraints;
  const maxStops = c.directOnly ? 0 : c.maxStops;
  if (maxStops !== undefined && (o.outbound.stops > maxStops || (o.inbound && o.inbound.stops > maxStops))) return false;
  if (c.onlyAirports.length) {
    const ends = [o.outbound.from, o.outbound.to];
    if (!ends.every((e) => c.onlyAirports.includes(e)) && !c.onlyAirports.some((a) => ends.includes(a))) return false;
  }
  if (c.excludedAirports.some((a) => a === o.outbound.from || a === o.outbound.to)) return false;
  const names = o.airlines.map((a) => a.toLowerCase());
  if (c.excludedAirlines.some((x) => names.includes(x.toLowerCase()))) return false;
  if (q.tripType === "roundtrip") {
    if (!o.inbound) return false;
    const ret = o.inbound.departAt.slice(0, 10);
    const stay = diffDays(dep, ret);
    const range = stayRange(q);
    if (range && (stay < range.min || stay > range.max)) return false;
    if (q.longWeekends && !([4, 5].includes(weekday(dep)) && [0, 1].includes(weekday(ret)))) return false;
    if (q.return?.date) {
      const flex = Math.max(q.return.flexDays, q.departure.flexDays);
      if (Math.abs(diffDays(q.return.date, ret)) > flex) return false;
    } else if (q.return?.month && monthOf(ret) !== q.return.month) return false;
  } else if (o.inbound) return false;
  if (c.avoidOvernightLayovers) {
    for (const leg of [o.outbound, o.inbound]) if (leg?.layovers.some((l) => l.overnight)) return false;
  }
  if (c.maxLayoverHours) {
    for (const leg of [o.outbound, o.inbound]) if (leg?.layovers.some((l) => l.minutes > c.maxLayoverHours! * 60)) return false;
  }
  return true;
}

function toDisplay(o: FlightOffer, currency: string, rates: Rates): FlightOffer | undefined {
  const price = convert(o.originalPrice, o.originalCurrency, currency, rates);
  if (!Number.isFinite(price)) return undefined;
  return { ...o, price: roundPrice(price), currency };
}

/** Ejecuta la búsqueda completa: resolución → expansión → proveedor (con caché) → análisis → ranking. */
export async function runSearch(q: SearchQuery, metrics: SearchMetrics, hooks: EngineHooks = {}, providerOverride?: FlightProvider): Promise<SearchOutcome> {
  const started = Date.now();
  const e = env();
  const provider = providerOverride ?? getFlightProvider();
  const store = await getStore();
  const notices: string[] = [];

  // 1. Resolver lugares.
  const originPlaces = q.origins.map((o) => ({ ref: o, r: resolvePlace(o) }));
  const unresolved = originPlaces.filter((x) => !x.r).map((x) => x.ref.name);
  const origins = originPlaces.map((x) => x.r).filter((x): x is ResolvedPlace => !!x);
  if (!origins.length) throw new SearchError(`No he encontrado el lugar de origen${unresolved.length ? ` «${unresolved.join(", ")}»` : ""}. Prueba con una ciudad o un código de aeropuerto (p. ej. MEX).`);
  if (unresolved.length) notices.push(`No he reconocido: ${unresolved.join(", ")}.`);

  const destPlaces = q.destinations.map((d) => ({ ref: d, r: resolvePlace(d) }));
  const destinations = destPlaces.map((x) => x.r).filter((x): x is ResolvedPlace => !!x);
  const destUnresolved = destPlaces.filter((x) => !x.r).map((x) => x.ref.name);
  if (destUnresolved.length) notices.push(`No he reconocido el destino: ${destUnresolved.join(", ")}.`);
  if (q.destinationMode === "specific" && !destinations.length) throw new SearchError(`No he encontrado el destino${destUnresolved.length ? ` «${destUnresolved.join(", ")}»` : ""}.`);

  const homeCountry = origins[0]!.country;
  const currency = (q.currency ?? currencyForCountry(homeCountry, e.DEFAULT_CURRENCY)).toUpperCase();
  const rates = await getRates();
  if (!rates.rates[currency]) notices.push(`No tengo tipo de cambio para ${currency}; muestro USD.`);
  const displayCurrency = rates.rates[currency] ? currency : "USD";
  const fromUsd = (usd: number) => convert(usd, "USD", displayCurrency, rates);

  // "Casa" del usuario: los traslados al aeropuerto se estiman desde aquí (Getaria → Biarritz, CDMX → Cancún).
  // Un segundo origen no opcional a más de 400 km se trata como otra casa ("desde Madrid o Barcelona").
  const homes = origins.filter((p, i) => i === 0 || (!p.optional && haversineKm(origins[0]!.lat, origins[0]!.lon, p.lat, p.lon) > 400));
  const homeFor = (lat: number, lon: number) => homes.reduce((best, h) => (haversineKm(h.lat, h.lon, lat, lon) < haversineKm(best.lat, best.lon, lat, lon) ? h : best), homes[0]!);

  // 2. Expandir aeropuertos.
  const originCands = expandAirports(origins, {
    nearby: q.flexibility.nearbyOrigins,
    radiusKm: q.flexibility.radiusKm,
    allowForeign: q.flexibility.allowForeignOrigins,
    max: e.MAX_ORIGIN_AIRPORTS,
  }).map((c) => {
    const h = homeFor(c.lat, c.lon);
    return { ...c, place: h, distanceKm: Math.round(haversineKm(h.lat, h.lon, c.lat, c.lon)) };
  });
  const onlyDest = q.constraints.onlyAirports.filter((a) => !originCands.some((o) => o.iata === a));
  let destCands: CandidateAirport[];
  if (q.destinationMode === "anywhere" && !destinations.length) {
    const month = Number(departureWindow(q).months[0]!.slice(5, 7));
    const home = origins[0]!;
    if (provider.supportsAnywhere && !q.destinationTags.length) {
      destCands = []; // el proveedor devuelve los destinos más baratos desde cada origen
    } else {
      const homeAirports = new Set(originCands.map((c) => c.iata));
      const picks = pickInspiration(q.destinationTags, month, homeAirports, 50);
      destCands = picks
        .map((p) => getAirport(p.iata))
        .filter((a): a is NonNullable<typeof a> => !!a && haversineKm(home.lat, home.lon, a.lat, a.lon) > 400)
        .sort((a, b) => haversineKm(home.lat, home.lon, a.lat, a.lon) - haversineKm(home.lat, home.lon, b.lat, b.lon))
        .slice(0, e.MAX_DESTINATION_AIRPORTS)
        .map((a) => airportAsCandidate(a, picks.find((p) => p.iata === a.iata)?.name));
      if (!destCands.length) throw new SearchError("No tengo destinos sugeridos que encajen con esa descripción. Prueba a nombrar una ciudad o región.");
      notices.push(`Destinos abiertos: comparo ${destCands.map((d) => d.city).join(", ")}.`);
    }
  } else {
    destCands = expandAirports(destinations, {
      nearby: q.flexibility.nearbyDestinations,
      radiusKm: Math.min(q.flexibility.radiusKm, 200),
      allowForeign: false,
      max: e.MAX_DESTINATION_AIRPORTS,
      onlyAirports: onlyDest,
      excludedAirports: q.constraints.excludedAirports,
    });
  }
  if (!originCands.length || (!destCands.length && q.destinationMode !== "anywhere")) throw new SearchError("No encuentro aeropuertos con vuelos regulares para esa combinación.");

  // 3. Construir llamadas: requested×requested primero; destinos agrupados por ciudad si el proveedor lo admite.
  const win = departureWindow(q);
  const destCodes = new Map<string, CandidateAirport[]>();
  for (const d of destCands) {
    const metro = provider.supportsCityCodes ? findMetroByAirport(d.iata) : undefined;
    const code = metro && !q.constraints.onlyAirports.length ? metro.code : d.iata;
    destCodes.set(code, [...(destCodes.get(code) ?? []), d]);
  }
  const returnParam = q.tripType === "oneway" ? undefined : (q.return?.month ?? (q.return?.date ? monthOf(q.return.date) : undefined));
  const calls: Call[] = [];
  if (!destCands.length) {
    for (const o of originCands.filter((c) => c.requested)) {
      for (const month of win.months) {
        calls.push({ req: { origin: o.iata, departure: month, return: returnParam, oneWay: q.tripType === "oneway", directOnly: q.constraints.directOnly, adults: q.passengers.adults + q.passengers.children, currency: provider.isDemo ? "USD" : displayCurrency }, requested: true, label: `${o.iata}→cualquier sitio` });
      }
    }
  }
  // En búsquedas abiertas solo se expanden los orígenes pedidos (si no, las combinaciones se disparan).
  for (const o of q.destinationMode === "anywhere" ? originCands.filter((c) => c.requested) : originCands) {
    for (const [code, ds] of destCodes) {
      for (const month of win.months) {
        calls.push({
          req: { origin: o.iata, destination: code, departure: month, return: returnParam, oneWay: q.tripType === "oneway", directOnly: q.constraints.directOnly, adults: q.passengers.adults + q.passengers.children, currency: provider.isDemo ? "USD" : displayCurrency },
          requested: o.requested && ds.some((d) => d.requested),
          label: `${o.iata}→${code}`,
        });
      }
    }
  }
  calls.sort((a, b) => Number(b.requested) - Number(a.requested));
  const maxCalls = e.MAX_PROVIDER_CALLS_PER_QUERY;
  if (calls.length > maxCalls) notices.push(`He limitado la búsqueda a ${maxCalls} de ${calls.length} combinaciones para no gastar cuota; afina origen o destino para ver el resto.`);
  const selected = calls.slice(0, maxCalls);

  hooks.onStatus?.(`Comparando ${originCands.length} aeropuerto${originCands.length > 1 ? "s" : ""} de origen × ${destCands.length} de destino (${selected.length} consultas)`);

  // 4. Consultar (caché → presupuesto diario → proveedor), en paralelo con límite.
  let done = 0;
  const errors: string[] = [];
  const dayKey = `calls:${provider.id}:${todayISO()}`;
  const results = await mapLimit(selected, e.PROVIDER_CONCURRENCY, async (call) => {
    const key = `search:v${CACHE_VERSION}:${provider.id}:${hash(JSON.stringify(call.req))}:${JSON.stringify(call.req).length}`;
    try {
      const cached = await store.getCache<FlightOffer[]>(key);
      if (cached) {
        metrics.cacheHits++;
        return cached.value;
      }
      metrics.cacheMisses++;
      if (!provider.isDemo && e.DAILY_PROVIDER_CALL_BUDGET > 0) {
        const used = await store.incr(dayKey, 1, 86_400);
        if (used > e.DAILY_PROVIDER_CALL_BUDGET) {
          metrics.skippedByBudget++;
          return [];
        }
      }
      metrics.providerCalls++;
      const offers = await provider.search(call.req);
      await store.setCache(key, offers, e.CACHE_TTL_MINUTES);
      return offers;
    } catch (err) {
      const msg = err instanceof ProviderError ? err.message : `Error consultando ${call.label}`;
      errors.push(msg);
      log.warn("Fallo del proveedor", { call: call.label, error: String(err) });
      return [] as FlightOffer[];
    } finally {
      done++;
      hooks.onProgress?.(done, selected.length, call.label);
    }
  });
  if (metrics.skippedByBudget) notices.push("Se ha alcanzado el presupuesto diario de consultas al proveedor; algunos resultados vienen solo de la caché.");
  if (errors.length) notices.push(errors.length === selected.length ? `El proveedor de datos ha fallado: ${errors[0]}` : `Algunas consultas fallaron (${errors.length}/${selected.length}); los resultados pueden estar incompletos.`);

  // 5. Normalizar a la moneda de visualización y deduplicar.
  const seen = new Set<string>();
  const all: FlightOffer[] = [];
  for (const list of results) {
    for (const raw of list) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const o = toDisplay(raw, displayCurrency, rates);
      if (o) all.push(o);
    }
  }

  // 6. Análisis: traslados, trampas, coste real.
  const originByIata = new Map(originCands.map((c) => [c.iata, c]));
  const destByIata = new Map(destCands.map((c) => [c.iata, c]));
  const pax = q.passengers.adults + q.passengers.children;
  const transferCache = new Map<string, GroundTransfer>();
  const transfer = (place: { label: string; lat: number; lon: number; country: string }, iata: string): GroundTransfer | undefined => {
    const key = `${place.label}|${iata}`;
    if (transferCache.has(key)) return transferCache.get(key);
    const a = getAirport(iata);
    if (!a) return undefined;
    const t = estimateTransfer(place, a, getCountry(place.country)?.region);
    const g: GroundTransfer = { ...t, cost: roundPrice(fromUsd(t.costUsd) * pax), currency: displayCurrency };
    transferCache.set(key, g);
    return g;
  };

  const analyzed: AnalyzedOffer[] = [];
  for (const o of all) {
    const oc = originByIata.get(o.outbound.from);
    let dc = destByIata.get(o.outbound.to);
    if (!dc) {
      // Destino devuelto por código de ciudad: aceptamos aeropuertos de la misma ciudad-área.
      const metro = findMetroByAirport(o.outbound.to);
      const sibling = metro && destCands.find((d) => metro.airports.includes(d.iata));
      if (sibling) dc = { ...sibling, iata: o.outbound.to, requested: sibling.requested };
      else if (q.destinationMode === "anywhere") {
        const ap = getAirport(o.outbound.to);
        if (ap) dc = airportAsCandidate(ap);
      }
    }
    if (!oc || !dc) continue;
    const originTransfer = transfer(oc.place, oc.iata);
    const destCenter = findMetroByAirport(dc.iata) ?? (dc.place.metro ? dc.place.metro : undefined);
    // Destino "país": el traslado se calcula a la ciudad del propio aeropuerto, no al centro del país.
    const destPlace = destCenter
      ? { label: destCenter.name, lat: destCenter.lat, lon: destCenter.lon, country: destCenter.country }
      : dc.place.via === "country"
        ? { label: dc.city || dc.iata, lat: dc.lat, lon: dc.lon, country: dc.country }
        : dc.place;
    const destinationTransfer = transfer(destPlace, dc.iata);
    const traps = detectTraps(o, { fromUsd, destinationTransfer, wantsBaggage: q.constraints.baggageIncluded, passengers: pax });
    const transfers = (originTransfer?.cost ?? 0) * (o.inbound ? 2 : 1) + (destinationTransfer?.cost ?? 0) * (o.inbound ? 2 : 1);
    const realCost = roundPrice(o.price + transfers + trapExtraCost(traps));
    const link = purchaseLink(o.deepLink, o.provider);
    analyzed.push({
      ...o,
      deepLink: link?.url,
      affiliateLink: link?.affiliate,
      traps,
      originTransfer,
      destinationTransfer,
      realCost,
      isAlternative: !(oc.requested && dc.requested),
      score: 0,
      ref: "",
    });
  }

  // 7. Histórico de precios y chollos (en USD para comparar entre búsquedas).
  const toUsd = (x: number) => convert(x, displayCurrency, "USD", rates);
  const routeKey = (o: FlightOffer) => `${o.provider}:${findMetroByAirport(o.outbound.from)?.code ?? o.outbound.from}-${findMetroByAirport(o.outbound.to)?.code ?? o.outbound.to}`;
  const groups = new Map<string, AnalyzedOffer[]>();
  for (const o of analyzed) {
    const k = `${routeKey(o)}|${monthOf(o.outbound.departAt)}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const observations: PriceObservation[] = [];
  for (const [k, list] of groups) {
    const [route, month] = k.split("|") as [string, string];
    const history = await store.routePrices(route, month, q.tripType).catch(() => [] as number[]);
    const daily = dailyMinimums(list, (o) => o.outbound.departAt.slice(0, 10), (o) => toUsd(o.price));
    const samples = [...history, ...daily.values()];
    for (const o of list) {
      const deal = computeDeal(toUsd(o.price), samples, `mediana del precio mínimo diario de ${route.split(":")[1]} en ${month} (${samples.length} referencias: histórico propio + esta búsqueda)`);
      if (deal) o.deal = { ...deal, median: roundPrice(fromUsd(deal.median)) };
    }
    // Histórico: un precio de referencia (el mínimo) por día de salida.
    for (const [date, usd] of daily) {
      const o = list.find((x) => x.outbound.departAt.startsWith(date) && Math.abs(toUsd(x.price) - usd) < 0.5);
      if (!o) continue;
      observations.push({ route, origin: o.outbound.from, destination: o.outbound.to, departMonth: month, priceUsd: Math.round(usd), airline: o.airline, tripType: q.tripType, provider: o.provider });
    }
  }
  await store.addPrices(observations).catch((err: unknown) => log.warn("No se pudo guardar el histórico", { error: String(err) }));

  // 8. Filtrar por restricciones y fechas; matriz de fechas sobre el conjunto sin filtrar por fecha.
  const matchWin = { from: win.from, to: win.to };
  const filtered = analyzed.filter((o) => offerMatches(o, q, matchWin));
  const matrixBase = analyzed.filter((o) => offerMatches(o, q, { from: "0000", to: "9999" }));
  const dateMatrix = buildDateMatrix(matrixBase, win.anchor);

  let pool = filtered;
  if (q.constraints.baggageIncluded) {
    const withBags = pool.filter((o) => o.baggageIncluded !== false);
    if (withBags.length) pool = withBags;
  }
  if (q.budget) {
    const budget = convert(q.budget.amount, q.budget.currency, displayCurrency, rates);
    const under = pool.filter((o) => o.realCost <= budget);
    if (!under.length && pool.length) notices.push(`Nada por debajo de tu presupuesto (${roundPrice(budget)} ${displayCurrency}). Te enseño lo más cercano.`);
    else pool = under;
  }

  const ranked = rankOffers(pool, q.priorities, q.constraints.preferredAirlines);
  const primaryAll = ranked.filter((o) => !o.isAlternative);
  const bestPrimary = primaryAll.length ? Math.min(...primaryAll.map((o) => o.realCost)) : Infinity;
  const primary = diversify(primaryAll, 6, q.destinationMode === "anywhere");
  const alternatives = diversify(
    ranked.filter((o) => o.isAlternative && o.realCost < bestPrimary),
    4,
  );
  [...primary, ...alternatives].forEach((o, i) => (o.ref = `F${i + 1}`));

  if (!filtered.length) {
    if (!all.length) notices.push(provider.isDemo ? "No hay datos de demostración para esa ruta." : "El proveedor no tiene precios recientes para esa ruta y fechas. Puede que existan vuelos (sobre todo low cost) que no cubre: compruébalo en la web de la aerolínea.");
    else notices.push("Hay vuelos, pero ninguno cumple todas tus condiciones. Prueba a relajar fechas, escalas o equipaje.");
  } else if (!primaryAll.length && alternatives.length) {
    notices.push("No hay resultados desde/hacia los aeropuertos que pediste, pero sí alternativas cercanas.");
  }

  const summarize = (cands: CandidateAirport[], side: "from" | "to"): AirportSummary[] =>
    cands.map((c) => {
      const mine = analyzed.filter((o) => (side === "from" ? o.outbound.from : o.outbound.to) === c.iata && offerMatches(o, q, matchWin));
      return { iata: c.iata, name: c.name, city: c.city, country: c.country, distanceKm: c.distanceKm, requested: c.requested, bestRealCost: mine.length ? Math.min(...mine.map((o) => o.realCost)) : undefined };
    });

  metrics.ms = Date.now() - started;
  log.info("Búsqueda", { provider: provider.id, calls: selected.length, providerCalls: metrics.providerCalls, cacheHits: metrics.cacheHits, offers: all.length, matched: filtered.length, ms: metrics.ms });

  return {
    query: q,
    currency: displayCurrency,
    provider: { id: provider.id, label: provider.label, isDemo: provider.isDemo, coverageNote: provider.coverageNote },
    primary,
    alternatives,
    origins: summarize(originCands, "from"),
    destinations: summarize(destCands, "to"),
    dateMatrix,
    notices,
    fx: { source: rates.source, fallback: rates.fallback },
    fetchedAt: new Date().toISOString(),
    stats: { providerCalls: metrics.providerCalls, cacheHits: metrics.cacheHits, offersSeen: all.length, ms: metrics.ms },
  };
}

function airportAsCandidate(a: Airport, label?: string): CandidateAirport {
  const place: ResolvedPlace = { label: label ?? (a.city || a.iata), lat: a.lat, lon: a.lon, country: a.country, airports: [a.iata], via: "iata", optional: false };
  return { iata: a.iata, name: a.name, city: label ?? a.city, country: a.country, lat: a.lat, lon: a.lon, distanceKm: 0, place, requested: true };
}

/** Evita mostrar 6 variantes casi idénticas: máximo 2 por combinación origen-destino-aerolínea (o por destino en búsquedas abiertas). */
function diversify(list: AnalyzedOffer[], n: number, byDestination = false): AnalyzedOffer[] {
  const count = new Map<string, number>();
  const out: AnalyzedOffer[] = [];
  for (const o of list) {
    const k = byDestination ? o.outbound.to : `${o.outbound.from}-${o.outbound.to}-${o.airline}`;
    const c = count.get(k) ?? 0;
    if (c >= 2) continue;
    count.set(k, c + 1);
    out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

/** Precio más barato por fecha de salida: ±3 días alrededor de la fecha elegida o los días más baratos del mes. */
export function buildDateMatrix(offers: AnalyzedOffer[], anchor?: string): DatePrice[] {
  const byDate = new Map<string, number>();
  for (const o of offers) {
    const d = o.outbound.departAt.slice(0, 10);
    byDate.set(d, Math.min(byDate.get(d) ?? Infinity, o.price));
  }
  if (anchor) {
    const base = byDate.get(anchor);
    const out: DatePrice[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = addDays(anchor, i);
      const p = byDate.get(d);
      if (p !== undefined) out.push({ date: d, price: p, delta: base !== undefined ? p - base : undefined });
    }
    return out;
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, price]) => ({ date, price }));
}

