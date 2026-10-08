import type { PlaceRef } from "../schema/query";
import { getAirport, getAirports, getCountries, getCountry, getPlaces, type Airport } from "./data";
import { haversineKm } from "./distance";
import { COUNTRY_ALIASES, findMetro, PLACE_ALIASES, type Metro } from "./metros";
import { normalize } from "../util/text";

export interface ResolvedPlace {
  /** Nombre legible ("Getaria", "Tokio", "MEX"). */
  label: string;
  lat: number;
  lon: number;
  country: string;
  /** Aeropuertos que el usuario pidió (o los propios de la ciudad). */
  airports: string[];
  metro?: Metro;
  /** Cómo se resolvió (para depurar y mostrar supuestos). */
  via: "iata" | "metro" | "country" | "airport_city" | "gazetteer" | "llm_coords";
  optional: boolean;
}

/** Radio en el que un aeropuerto se considera "el de esa ciudad". */
const LOCAL_AIRPORT_KM = 45;

function countryHint(ref: PlaceRef): string | undefined {
  if (ref.country) return ref.country.toUpperCase();
  const m = ref.name.match(/\(([^)]+)\)/);
  if (m) return COUNTRY_ALIASES[normalize(m[1]!)];
  return undefined;
}

function cleanName(name: string): string {
  return normalize(
    name
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(aeropuerto|aeropuertos|airport|internacional|de|del|la|el)\b/gi, " "),
  );
}

function scheduled(a: Airport) {
  return a.scheduled;
}

export function airportsNear(lat: number, lon: number, km: number): { airport: Airport; km: number }[] {
  return getAirports()
    .filter(scheduled)
    .map((a) => ({ airport: a, km: haversineKm(lat, lon, a.lat, a.lon) }))
    .filter((x) => x.km <= km)
    .sort((a, b) => a.km - b.km);
}

function fromAirports(codes: string[], ref: PlaceRef, via: ResolvedPlace["via"]): ResolvedPlace | undefined {
  const aps = codes.map(getAirport).filter((a): a is Airport => !!a);
  if (!aps.length) return undefined;
  const lat = aps.reduce((s, a) => s + a.lat, 0) / aps.length;
  const lon = aps.reduce((s, a) => s + a.lon, 0) / aps.length;
  return { label: ref.name, lat, lon, country: aps[0]!.country, airports: aps.map((a) => a.iata), via, optional: !!ref.optional };
}

function localAirports(lat: number, lon: number): string[] {
  // Si no hay ninguno muy cerca, el más próximo en un radio mayor (pueblos alejados).
  const near = airportsNear(lat, lon, LOCAL_AIRPORT_KM).length ? airportsNear(lat, lon, LOCAL_AIRPORT_KM) : airportsNear(lat, lon, 150).slice(0, 1);
  const large = near.filter((x) => x.airport.size === "L");
  return (large.length ? large : near).slice(0, 3).map((x) => x.airport.iata);
}

/** Convierte lo que dijo el usuario en coordenadas + aeropuertos propios. */
export function resolvePlace(ref: PlaceRef): ResolvedPlace | undefined {
  const hint = countryHint(ref);
  const optional = !!ref.optional;

  // 1. Códigos IATA explícitos.
  if (ref.iata?.length) {
    const metro = ref.iata.length === 1 ? findMetro(ref.iata[0]!) : undefined;
    if (metro) return { label: metro.name, lat: metro.lat, lon: metro.lon, country: metro.country, airports: metro.airports, metro, via: "metro", optional };
    const r = fromAirports(ref.iata, ref, "iata");
    if (r) return r;
  }
  const raw = ref.name.trim();
  if (/^[A-Z]{3}$/.test(raw)) {
    const metro = findMetro(raw);
    if (metro) return { label: metro.name, lat: metro.lat, lon: metro.lon, country: metro.country, airports: metro.airports, metro, via: "metro", optional };
    const r = fromAirports([raw], ref, "iata");
    if (r) return r;
  }

  const name = cleanName(raw);
  if (!name) return undefined;

  // 2. Ciudades-área (Tokio, Londres, CDMX, "Ciudad de México"...).
  const metro = findMetro(normalize(raw.replace(/\([^)]*\)/g, " "))) ?? findMetro(name);
  if (metro && (!hint || hint === metro.country)) {
    return { label: metro.name, lat: metro.lat, lon: metro.lon, country: metro.country, airports: metro.airports, metro, via: "metro", optional };
  }

  // 3. Países ("a España", "a Japón"): sus aeropuertos principales.
  const cc = countryFromName(name);
  if (cc) {
    const codes = mainAirportsOf(cc);
    const first = codes.length ? getAirport(codes[0]!) : undefined;
    if (first) return { label: getCountry(cc)?.es ?? raw, lat: first.lat, lon: first.lon, country: cc, airports: codes, via: "country", optional };
  }

  // 4. Nombre de aeropuerto o de su municipio ("aeropuerto de Biarritz").
  const alias = PLACE_ALIASES[name];
  const target = alias ? normalize(alias.name) : name;
  const country = hint ?? alias?.country;
  const byCity = getAirports().filter(
    (a) =>
      a.scheduled &&
      (!country || a.country === country) &&
      (normalize(a.city) === target || a.city.split(/[/,]| - /).some((c) => normalize(c) === target) || normalize(a.name).startsWith(target + " ")),
  );
  if (byCity.length) {
    const sorted = [...byCity].sort((a, b) => (a.size === b.size ? 0 : a.size === "L" ? -1 : 1));
    const first = sorted[0]!;
    return { label: raw.replace(/\([^)]*\)/g, "").trim(), lat: first.lat, lon: first.lon, country: first.country, airports: sorted.slice(0, 3).map((a) => a.iata), via: "airport_city", optional };
  }

  // 5. Gazetteer (GeoNames): municipios pequeños como Getaria.
  const candidates = getPlaces().filter((p) => (!country || p.country === country) && normalize(p.name) === target);
  if (candidates.length) {
    const best = candidates.reduce((a, b) => (b.population > a.population ? b : a));
    return { label: raw.replace(/\([^)]*\)/g, "").trim(), lat: best.lat, lon: best.lon, country: best.country, airports: localAirports(best.lat, best.lon), via: "gazetteer", optional };
  }

  // 6. Coordenadas aportadas por el LLM (marcadas como aproximadas).
  if (ref.lat !== undefined && ref.lon !== undefined) {
    const cc = country ?? ref.country ?? nearestCountry(ref.lat, ref.lon);
    return { label: raw, lat: ref.lat, lon: ref.lon, country: cc, airports: localAirports(ref.lat, ref.lon), via: "llm_coords", optional };
  }
  return undefined;
}

function nearestCountry(lat: number, lon: number): string {
  const near = airportsNear(lat, lon, 500);
  return near[0]?.airport.country ?? "US";
}

/** Aeropuertos principales por país (los grandes con más rutas internacionales). */
const MAIN_AIRPORTS: Record<string, string[]> = {
  ES: ["MAD", "BCN", "AGP", "PMI", "VLC", "BIO"],
  MX: ["MEX", "CUN", "GDL", "MTY", "SJD", "PVR"],
  US: ["JFK", "LAX", "MIA", "ORD", "SFO", "IAH"],
  FR: ["CDG", "ORY", "NCE", "LYS", "MRS"],
  IT: ["FCO", "MXP", "VCE", "NAP", "BLQ"],
  GB: ["LHR", "LGW", "MAN", "STN", "EDI"],
  DE: ["FRA", "MUC", "BER", "DUS", "HAM"],
  PT: ["LIS", "OPO", "FAO"],
  JP: ["HND", "NRT", "KIX"],
  CN: ["PEK", "PVG", "CAN"],
  KR: ["ICN"],
  TH: ["BKK", "HKT"],
  NL: ["AMS"],
  BE: ["BRU"],
  CH: ["ZRH", "GVA"],
  AT: ["VIE"],
  GR: ["ATH", "HER", "JTR"],
  TR: ["IST", "SAW", "AYT"],
  IE: ["DUB"],
  CA: ["YYZ", "YVR", "YUL"],
  BR: ["GRU", "GIG", "BSB"],
  AR: ["EZE", "AEP"],
  CO: ["BOG", "MDE", "CTG"],
  PE: ["LIM", "CUZ"],
  CL: ["SCL"],
  CU: ["HAV", "VRA"],
  DO: ["PUJ", "SDQ"],
  CR: ["SJO", "LIR"],
  MA: ["RAK", "CMN"],
  EG: ["CAI", "HRG"],
  AE: ["DXB", "AUH"],
  IN: ["DEL", "BOM"],
  AU: ["SYD", "MEL"],
};

/** "españa", "spain", "japón" → ISO2, usando alias y los nombres del dataset de países. */
export function countryFromName(normalizedName: string): string | undefined {
  if (COUNTRY_ALIASES[normalizedName]) return COUNTRY_ALIASES[normalizedName];
  for (const [cc, c] of Object.entries(getCountries())) {
    if (normalize(c.es) === normalizedName || normalize(c.en) === normalizedName) return cc;
  }
  return undefined;
}

export function mainAirportsOf(cc: string): string[] {
  const curated = MAIN_AIRPORTS[cc]?.filter((c) => getAirport(c));
  if (curated?.length) return curated;
  return getAirports()
    .filter((a) => a.country === cc && a.scheduled && a.size === "L")
    .slice(0, 5)
    .map((a) => a.iata);
}

export function countryName(cc: string): string {
  return getCountry(cc)?.es ?? cc;
}
