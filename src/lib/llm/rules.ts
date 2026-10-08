import { ParseResultSchema, SearchQuerySchema, type ParseResult, type PlaceRef, type Priority, type SearchQuery, type SearchQueryInput } from "../schema/query";
import { resolvePlace } from "../geo/resolve";
import { COUNTRY_ALIASES } from "../geo/metros";
import { getAirports } from "../geo/data";
import { AIRLINES } from "../providers/airlines";
import { MONTHS_ES, monthLabel, nextMonthOccurrence } from "../util/dates";
import { normalize } from "../util/text";

/**
 * Intérprete por reglas (sin IA). Se usa cuando no hay clave de LLM o el LLM falla.
 * Cubre los patrones más habituales en español; el LLM cubre el resto.
 */

const MONTH_RE = MONTHS_ES.join("|") + "|setiembre";
const NUM_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };

function monthIndex(name: string): number {
  const n = normalize(name);
  if (n === "setiembre") return 9;
  return MONTHS_ES.indexOf(n) + 1;
}

function toNum(s: string): number {
  const n = NUM_WORDS[normalize(s)];
  if (n) return n;
  return Number(s.replace(/[.\s](?=\d{3}\b)/g, "").replace(",", "."));
}

/** Palabras que cortan un nombre de lugar. */
const STOP = new Set(
  "a al de del desde hacia hasta para por en el la los las un una o y e ni que con sin ida vuelta solo sólo cualquier aeropuerto aeropuertos cercano cercanos cercana proximo si mas más menos barato barata vuelo vuelos busca buscame búscame quiero ir viajar puedo me en entre del este esta este próximo proximo semana mes fin fines dias días noches noche personas adultos ahora".split(" "),
);

/** Artículos que pueden empezar un nombre propio ("Los Ángeles", "La Habana"). */
const ARTICLES = new Set(["los", "las", "la", "el"]);

/** Intenta resolver la frase más larga (hasta 4 palabras) que empiece en `text`. */
function longestPlace(text: string, opts: { allowLower: boolean }): { ref: PlaceRef; used: string } | undefined {
  const words = text.trim().split(/\s+/);
  const max = Math.min(5, words.length);
  for (let n = max; n >= 1; n--) {
    let phrase = words.slice(0, n).join(" ").replace(/[,.;:!?¿¡]+$/g, "");
    // Admite "Getaria (España)" aunque el paréntesis ocupe otra palabra.
    const paren = text.trim().slice(phrase.length).match(/^\s*\(([^)]+)\)/);
    const first = words[0] ?? "";
    if (!opts.allowLower && !/^[A-ZÁÉÍÓÚÑ]/.test(first)) return undefined;
    if (STOP.has(normalize(first)) && !ARTICLES.has(normalize(first))) return undefined;
    if (n > 1 && STOP.has(normalize(words[n - 1]!))) continue;
    phrase = phrase.replace(/^(?:el|la)\s+/i, "");
    const country = paren ? COUNTRY_ALIASES[normalize(paren[1]!)] : undefined;
    const ref: PlaceRef = { name: phrase, ...(country ? { country } : {}) };
    if (resolvePlace(ref)) return { ref, used: phrase + (paren ? paren[0] : "") };
  }
  return undefined;
}

function findAfter(text: string, re: RegExp, allowLower = true): PlaceRef[] {
  const out: PlaceRef[] = [];
  for (const m of text.matchAll(re)) {
    const rest = text.slice(m.index! + m[0].length);
    // Varios lugares unidos por "o" / "," : "desde Madrid o Barcelona".
    let cursor = rest;
    for (let i = 0; i < 3; i++) {
      const hit = longestPlace(cursor, { allowLower });
      if (!hit) break;
      out.push(hit.ref);
      cursor = cursor.trim().slice(hit.used.length);
      const sep = cursor.match(/^\s*(?:,|\bo\b|\by\b)\s*/i);
      if (!sep) break;
      cursor = cursor.slice(sep[0].length);
    }
  }
  return out;
}

function dedupe(refs: PlaceRef[]): PlaceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = normalize(r.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function currencyFromSymbol(sym: string | undefined): string | undefined {
  if (!sym) return undefined;
  const s = normalize(sym);
  if (sym === "€" || s.startsWith("euro") || s === "eur") return "EUR";
  if (s === "usd" || s.startsWith("dolar")) return "USD";
  if (s === "mxn" || s.startsWith("peso")) return "MXN";
  if (s === "gbp" || s.startsWith("libra")) return "GBP";
  return undefined;
}

const AIRPORT_NICKNAMES: Record<string, string> = {
  narita: "NRT", haneda: "HND", heathrow: "LHR", gatwick: "LGW", stansted: "STN", luton: "LTN", barajas: "MAD", "el prat": "BCN",
  "charles de gaulle": "CDG", orly: "ORY", "felipe angeles": "NLU", aifa: "NLU", "benito juarez": "MEX", toluca: "TLC", fiumicino: "FCO",
  "jfk": "JFK", newark: "EWR", "la guardia": "LGA", kansai: "KIX", incheon: "ICN", schiphol: "AMS", ezeiza: "EZE",
};

function airportCodesIn(fragment: string): string[] {
  const out: string[] = [];
  const n = normalize(fragment);
  for (const [nick, code] of Object.entries(AIRPORT_NICKNAMES)) if (new RegExp(`\\b${nick}\\b`).test(n)) out.push(code);
  const known = new Set(getAirports().map((a) => a.iata));
  for (const m of fragment.matchAll(/\b([A-Z]{3})\b/g)) if (known.has(m[1]!)) out.push(m[1]!);
  return [...new Set(out)];
}

function airlinesIn(fragment: string): string[] {
  const n = normalize(fragment);
  const names = new Set<string>();
  for (const { name } of Object.values(AIRLINES)) if (new RegExp(`\\b${normalize(name)}\\b`).test(n)) names.add(name);
  return [...names];
}

export interface RulesContext {
  previous?: SearchQuery;
  now?: Date;
}

export function parseWithRules(message: string, ctx: RulesContext = {}): ParseResult {
  const now = ctx.now ?? new Date();
  const text = message.replace(/\s+/g, " ").trim();
  const n = normalize(text);
  const assumptions: string[] = [];
  const questions: string[] = [];

  // --- Lugares ---
  let origins: PlaceRef[] = [];
  let destinations: PlaceRef[] = [];
  const iataPair = text.match(/\b([A-Z]{3})\s*(?:-|–|→|>|\ba\b)\s*([A-Z]{3})\b/);
  if (iataPair) {
    origins.push({ name: iataPair[1]!, iata: [iataPair[1]!] });
    destinations.push({ name: iataPair[2]!, iata: [iataPair[2]!] });
  }
  origins.push(...findAfter(text, /\b(?:desde|salgo de|saliendo de|salir de|salida desde|salida de|vivo en|estoy en)\s+/gi));
  // "puedo ir al aeropuerto de Biarritz", "me acerco a Bilbao"
  origins.push(...findAfter(text, /\b(?:puedo ir|puedo llegar|puedo salir|me acerco|me puedo acercar|podría ir|podria ir)\s+(?:hasta\s+)?(?:al?\s+)?(?:el\s+)?(?:aeropuerto\s+de\s+)?/gi));
  // "(si el precio lo permite, Cancún por ejemplo)" → origen opcional
  for (const m of text.matchAll(/\(([^)]*(?:si el precio|si compensa|si sale|por ejemplo)[^)]*)\)/gi)) {
    for (const w of m[1]!.matchAll(/\b([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+)?)\b/g)) {
      const ref: PlaceRef = { name: w[1]!, optional: true };
      if (resolvePlace(ref)) origins.push(ref);
    }
  }
  destinations.push(
    ...findAfter(text, /\b(?:a|hacia|hasta|para|rumbo a|con destino a|destino|ir a|viajar a|volar a)\s+(?:cualquier\s+(?:parte|sitio|lugar|aeropuerto|zona)\s+de\s+)?(?:la\s+ciudad\s+de\s+)?/gi).filter(
      (d) => !origins.some((o) => normalize(o.name) === normalize(d.name)),
    ),
  );
  // "Barcelona - Lisboa", "Madrid → Roma"
  destinations.push(...findAfter(text, /\s(?:-|–|→|->)\s+/g));
  // "de Madrid a Roma" / "Madrid a Roma" sin "desde"
  if (!origins.length) {
    const m = text.match(/\bde\s+(.+?)\s+(?:a|hacia|→|->)\s+/i) ?? text.match(/^(?:vuelos?\s+)?(.+?)\s+(?:a|hacia|→|->|-)\s+/i);
    if (m) {
      const hit = longestPlace(m[1]!, { allowLower: true });
      if (hit) origins.push(hit.ref);
    }
  }
  origins = dedupe(origins);
  destinations = dedupe(destinations).filter((d) => !origins.some((o) => normalize(o.name) === normalize(d.name)));

  const anywhere = /\b(?:a|hacia|para)\s+(?:cualquier\s+(?:sitio|parte|lugar|destino)(?!\s+de\b)|donde sea|cualquier lado)/.test(n) || /\bsorprendeme\b/.test(n);
  const tags: string[] = [];
  if (/\b(calido|caliente|calor|soleado|sol)\b/.test(n)) tags.push("calido");
  if (/\bplaya/.test(n)) tags.push("playa");
  if (/\b(nieve|esquiar|esqui)\b/.test(n)) tags.push("nieve");
  if (/\bcaribe\b/.test(n)) tags.push("caribe");
  if (/\beuropa\b/.test(n)) tags.push("europa");

  // --- Refinamiento ---
  const prev = ctx.previous;
  const refinementWords = /^(?:y\s+)?(?:ahora|mejor|y si|y con|y sin|solo|sólo|unicamente|únicamente|sin|con|subeme|súbeme|bajame|bájame|cambia|cambialo|cámbialo|pon|quita|que sea|que salga|que vuelva|prefiero|otra vez|tambien|también|y )/i;
  const isRefinement = !!prev && (refinementWords.test(text) || (!origins.length && !destinations.length && !anywhere));

  const base: SearchQueryInput = isRefinement && prev ? structuredClone(prev) : { origins: [], destinations: [], departure: { flexDays: 0 } };
  const q = base as SearchQuery;
  q.constraints ??= { directOnly: false, baggageIncluded: false, avoidOvernightLayovers: false, preferredAirlines: [], excludedAirlines: [], onlyAirports: [], excludedAirports: [] };
  q.flexibility ??= { nearbyOrigins: true, nearbyDestinations: false, radiusKm: 300, allowForeignOrigins: true };
  q.passengers ??= { adults: 1, children: 0, infants: 0 };
  q.priorities ??= ["price"];
  q.destinationTags ??= [];
  q.tripType ??= "roundtrip";
  q.destinationMode ??= "specific";
  q.longWeekends ??= false;

  if (origins.length) q.origins = origins;
  if (destinations.length) {
    q.destinations = destinations;
    q.destinationMode = "specific";
    if (isRefinement) q.constraints.onlyAirports = [];
  } else if (anywhere) {
    q.destinations = [];
    q.destinationMode = "anywhere";
  }
  if (tags.length) q.destinationTags = tags;

  // --- Tipo de viaje ---
  if (/\b(solo ida|sólo ida|ida solamente|sin vuelta|one way|solamente ida)\b/.test(n.replace("sólo", "solo"))) q.tripType = "oneway";
  else if (/\bida y vuelta\b/.test(n)) q.tripType = "roundtrip";

  // --- Escalas ---
  if (/\bsin escalas largas\b/.test(n)) q.constraints.maxLayoverHours = 6;
  else if (/\b(sin escalas|directos?|vuelo directo|solo directos|sin paradas)\b/.test(n)) {
    q.constraints.directOnly = true;
    q.constraints.maxStops = 0;
  }
  if (/\b(con escalas|permite escalas|acepto escalas|no importa(n)? las escalas)\b/.test(n)) {
    q.constraints.directOnly = false;
    q.constraints.maxStops = undefined;
  }
  const maxStops = n.match(/\b(?:maximo|como mucho|max|hasta)\s+(una|un|1|dos|2)\s+escalas?\b/);
  if (maxStops) {
    q.constraints.maxStops = toNum(maxStops[1]!);
    q.constraints.directOnly = false;
  }
  const layover = n.match(/\bescalas? de (?:menos de|maximo|como mucho)\s+(\d+)\s*h/);
  if (layover) q.constraints.maxLayoverHours = Number(layover[1]);
  if (/\b(sin escalas nocturnas|no dormir en el aeropuerto|sin noches en aeropuertos?)\b/.test(n)) q.constraints.avoidOvernightLayovers = true;

  // --- Equipaje ---
  if (/\b(sin maleta|solo equipaje de mano|solo mochila)\b/.test(n)) q.constraints.baggageIncluded = false;
  else if (/\b(con maleta|maleta incluida|equipaje incluido|con equipaje|maleta facturada|con valija|valija incluida)\b/.test(n)) q.constraints.baggageIncluded = true;

  // --- Aeropuertos concretos ("solo Narita") y exclusiones ---
  const only = text.match(/\b(?:solo|sólo|únicamente|unicamente)\s+(?:a\s+|desde\s+|por\s+|en\s+)?((?:el\s+)?[\wÁÉÍÓÚáéíóúñ ]{3,30})/i);
  if (only) {
    const codes = airportCodesIn(only[1]!);
    if (codes.length) q.constraints.onlyAirports = codes;
  }
  const excl = text.match(/\b(?:sin pasar por|evita(?:r)?|excluye|menos por|que no sea(?:n)?)\s+([\wÁÉÍÓÚáéíóúñ ,]{3,40})/i);
  if (excl) {
    const codes = airportCodesIn(excl[1]!);
    if (codes.length) q.constraints.excludedAirports = codes;
    const al = airlinesIn(excl[1]!);
    if (al.length) q.constraints.excludedAirlines = al;
  }
  const noAirline = text.match(/\bsin\s+([A-ZÁÉÍÓÚ][\w ]{2,20})/);
  if (noAirline) {
    const al = airlinesIn(noAirline[1]!);
    if (al.length) q.constraints.excludedAirlines = [...new Set([...q.constraints.excludedAirlines, ...al])];
  }
  const withAirline = text.match(/\b(?:con|en|por)\s+([A-ZÁÉÍÓÚ][\w ]{2,25})/g);
  if (withAirline) {
    const al = withAirline.flatMap((f) => airlinesIn(f));
    if (al.length) {
      q.constraints.preferredAirlines = [...new Set(al)];
      if (!q.priorities.includes("airline")) q.priorities = ["airline", ...q.priorities.filter((p) => p !== "airline")];
    }
  }

  // --- Presupuesto ---
  const budget = text.match(/(?:menos de|m[aá]ximo(?: de)?|presupuesto(?: de| a| hasta| m[aá]ximo)?|hasta|no m[aá]s de|tope de|por debajo de|que no pase de)\s*(?:los\s+)?(\$|€)?\s*(\d[\d.,]*)\s*(€|euros?|eur|usd|d[oó]lares|mxn|pesos|libras|gbp|k)?/i);
  if (budget && !/\d+\s*(?:km|kil[oó]metros|h|horas|d[ií]as|escalas?)\b/i.test(budget[0] + text.slice((budget.index ?? 0) + budget[0].length, (budget.index ?? 0) + budget[0].length + 12))) {
    let amount = toNum(budget[2]!);
    if (budget[3]?.toLowerCase() === "k") amount *= 1000;
    const cur = currencyFromSymbol(budget[3] ?? budget[1]) ?? q.budget?.currency ?? q.currency ?? "";
    if (amount > 0) q.budget = { amount, currency: cur };
  }

  // --- Pasajeros ---
  const adults = n.match(/\b(\d|un|una|dos|tres|cuatro|cinco|seis)\s+(?:personas|adultos|pasajeros|viajeros)\b/);
  if (adults) q.passengers.adults = Math.max(1, toNum(adults[1]!));
  if (/\b(con mi pareja|con mi novi[oa]|con mi espos[oa]|con mi marido|con mi mujer|los dos|las dos|para dos)\b/.test(n)) q.passengers.adults = Math.max(q.passengers.adults, 2);
  const kids = n.match(/\b(\d|un|una|dos|tres|cuatro)\s+(?:ninos?|ninas?|hijos?|hijas?|menores)\b/);
  if (kids) q.passengers.children = toNum(kids[1]!);
  const babies = n.match(/\b(\d|un|una|dos)\s+(?:bebes?)\b/);
  if (babies) q.passengers.infants = toNum(babies[1]!);

  // --- Fechas ---
  const year = (m: number, y?: string) => (y ? `${y}-${String(m).padStart(2, "0")}` : nextMonthOccurrence(m, now));
  const range = n.match(new RegExp(`\\bdel? (\\d{1,2})(?: de (${MONTH_RE}))? al? (\\d{1,2}) de (${MONTH_RE})(?: (?:de |del )?(\\d{4}))?`));
  const single = n.match(new RegExp(`\\b(?:el |dia |salida el |saliendo el |salir el )?(\\d{1,2}) de (${MONTH_RE})(?: (?:de |del )?(\\d{4}))?`));
  const monthOnly = [...n.matchAll(new RegExp(`\\b(?:en|para|durante|de|a principios de|a finales de|mediados de)?\\s*(${MONTH_RE})(?: (?:de |del )?(\\d{4}))?`, "g"))];
  let dateTouched = false;
  if (range) {
    const m2 = monthIndex(range[4]!);
    const m1 = range[2] ? monthIndex(range[2]) : m2;
    const y2 = year(m2, range[5]);
    const y1 = m1 <= m2 ? `${y2.slice(0, 4)}-${String(m1).padStart(2, "0")}` : year(m1);
    q.departure = { date: `${y1}-${range[1]!.padStart(2, "0")}`, flexDays: q.departure?.flexDays ?? 0 };
    if (q.tripType === "roundtrip") q.return = { date: `${y2}-${range[3]!.padStart(2, "0")}`, flexDays: 0 };
    dateTouched = true;
  } else if (single) {
    const m = monthIndex(single[2]!);
    q.departure = { date: `${year(m, single[3])}-${single[1]!.padStart(2, "0")}`, flexDays: q.departure?.flexDays ?? 0 };
    dateTouched = true;
  } else if (monthOnly.length) {
    const first = monthOnly[0]!;
    const m = monthIndex(first[1]!);
    q.departure = { month: year(m, first[2]), flexDays: 0 };
    dateTouched = true;
    const back = n.match(new RegExp(`(?<!ida y )\\b(?:vuelta|volver|regreso|regresar)(?: en| a| de)? (${MONTH_RE})(?: (?:de |del )?(\\d{4}))?`));
    if (back && q.tripType === "roundtrip") q.return = { month: year(monthIndex(back[1]!), back[2]), flexDays: 0 };
    else if (dateTouched && !isRefinement) q.return = undefined;
  }
  const flex = n.match(/(?:±|\+-|\+\/-|mas o menos|más o menos|flexibles? de|flexibilidad de)\s*(\d)\s*d[ií]as?/) ?? text.match(/±\s*(\d)/);
  if (flex) q.departure.flexDays = Math.min(7, Number(flex[1]));
  else if (/\bfechas flexibles\b|\bflexible\b/.test(n)) q.departure.flexDays = 3;
  if (q.return?.date && flex) q.return.flexDays = q.departure.flexDays;
  if (/\b(fines? de semana largos?|puentes?|escapada de fin de semana)\b/.test(n)) {
    q.longWeekends = true;
    q.stayDays = undefined;
  }
  const stay = n.match(/\b(\d{1,2}|una|un|dos|tres)\s+(dias|noches|semanas?)\b/);
  if (stay && !/\b(\d{1,2})\s+d[ií]as?\b.*(antes|despues|flexib)/.test(n) && !flex) {
    const k = toNum(stay[1]!);
    const days = stay[2]!.startsWith("semana") ? k * 7 : k;
    q.stayDays = { min: Math.max(1, days - 1), max: days + 1 };
  }

  // --- Prioridades (en el orden en que se mencionan; "prioriza X" pasa delante) ---
  const PRIO_RE: [Priority, RegExp][] = [
    ["duration", /\b(mas rapido|menos horas|mas corto|menor duracion|rapido|rapidez)\b/],
    ["comfort", /\b(comod[oa]s?|comodidad|tranquil[oa]s?|sin prisas)\b/],
    ["schedule", /\b(buen horario|buenos horarios|sin madrugar|no madrugar|horario razonable|de dia)\b/],
    ["price", /\b(mas barat[oa]s?|barat[oa]s?|economic[oa]s?|precio)\b/],
  ];
  const found = PRIO_RE.map(([p, re]) => ({ p, i: n.search(re) })).filter((x) => x.i >= 0);
  const prioritized = n.match(/\b(?:prioriza|priorizar|prioridad|sobre todo|ante todo|lo importante es)\s+(?:lo\s+|el\s+|la\s+)?(\w+)/);
  if (prioritized) {
    const hit = PRIO_RE.find(([, re]) => re.test(prioritized[1]!));
    if (hit) found.push({ p: hit[0], i: -1 });
  }
  const prios = [...new Set(found.sort((a, b) => a.i - b.i).map((x) => x.p))];
  if (prios.length && !prios.includes("price")) prios.push("price");
  if (prios.length) q.priorities = [...new Set([...(q.priorities.includes("airline") ? (["airline"] as Priority[]) : []), ...prios])];

  // --- Radio / flexibilidad de aeropuertos ---
  const radius = n.match(/\b(\d{2,4})\s*(?:km|kilometros)\b/);
  if (radius) q.flexibility.radiusKm = Math.min(2000, Number(radius[1]));
  if (/\b(aeropuertos? cercanos?|alrededor|cercania|cualquier aeropuerto cercano|aeropuertos de la zona)\b/.test(n)) q.flexibility.nearbyOrigins = true;
  if (/\b(solo desde|unicamente desde|sin aeropuertos alternativos|no quiero otros aeropuertos)\b/.test(n)) q.flexibility.nearbyOrigins = false;
  if (/\b(estados unidos|eeuu|ee uu|usa)\b.*\b(tambien|si compensa|si sale)\b|\btambien (?:desde )?(?:estados unidos|eeuu)\b/.test(n)) q.flexibility.allowForeignOrigins = true;
  if (/\b(aeropuertos cercanos al destino|cerca del destino|destinos cercanos)\b/.test(n)) q.flexibility.nearbyDestinations = true;

  // --- Moneda ---
  const cur = n.match(/\ben (euros|dolares|pesos|libras|yenes|eur|usd|mxn|gbp|jpy)\b/);
  if (cur) q.currency = currencyFromSymbol(cur[1]) ?? (cur[1] === "yenes" || cur[1] === "jpy" ? "JPY" : undefined);

  // --- Huecos y supuestos ---
  if (!q.origins.length) questions.push("¿Desde qué ciudad o aeropuerto sales?");
  if (!q.destinations.length && q.destinationMode !== "anywhere") questions.push("¿A dónde quieres ir? (también vale «a cualquier sitio cálido», por ejemplo)");
  if (!isRefinement) {
    if (!q.departure.date && !q.departure.month && !dateTouched) {
      const next = nextMonthOccurrence(((now.getMonth() + 1) % 12) + 1, now);
      q.departure = { month: next, flexDays: 0 };
      assumptions.push(`No indicas fechas: busco en ${monthLabel(next)}.`);
    }
    if (!/ida y vuelta|solo ida|sólo ida/.test(text.toLowerCase())) assumptions.push(q.tripType === "roundtrip" ? "Asumo ida y vuelta." : "Solo ida.");
    if (!adults && !kids && q.passengers.adults === 1) assumptions.push("Asumo 1 adulto.");
    if (q.flexibility.nearbyOrigins && q.origins.length) assumptions.push(`Incluyo aeropuertos a menos de ${q.flexibility.radiusKm} km del origen como alternativas.`);
  }
  if (q.budget && !q.budget.currency) {
    const first = q.origins[0] ? resolvePlace(q.origins[0]) : undefined;
    q.budget.currency = first?.country === "MX" ? "MXN" : first?.country === "US" ? "USD" : q.currency ?? "EUR";
    assumptions.push(`Entiendo el presupuesto en ${q.budget.currency}.`);
  }

  const parsedQuery = SearchQuerySchema.safeParse(q);
  const finalQuery = parsedQuery.success ? parsedQuery.data : SearchQuerySchema.parse({ origins: q.origins ?? [], destinations: q.destinations ?? [], departure: q.departure ?? { flexDays: 0 } });
  return ParseResultSchema.parse({ query: finalQuery, assumptions: assumptions.slice(0, 6), questions: questions.slice(0, 2), isRefinement });
}
