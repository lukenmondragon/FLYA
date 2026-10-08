/**
 * "Ciudades-área": códigos IATA de ciudad que agrupan varios aeropuertos, con alias en español.
 * El centro (lat/lon) se usa para estimar traslados al llegar.
 */
export interface Metro {
  code: string;
  name: string;
  aliases: string[];
  country: string;
  airports: string[];
  lat: number;
  lon: number;
}

export const METROS: Metro[] = [
  { code: "TYO", name: "Tokio", aliases: ["tokio", "tokyo"], country: "JP", airports: ["HND", "NRT"], lat: 35.681, lon: 139.767 },
  { code: "OSA", name: "Osaka", aliases: ["osaka"], country: "JP", airports: ["KIX", "ITM", "UKB"], lat: 34.702, lon: 135.496 },
  { code: "LON", name: "Londres", aliases: ["londres", "london"], country: "GB", airports: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"], lat: 51.507, lon: -0.128 },
  { code: "PAR", name: "París", aliases: ["paris"], country: "FR", airports: ["CDG", "ORY", "BVA"], lat: 48.857, lon: 2.352 },
  { code: "NYC", name: "Nueva York", aliases: ["nueva york", "new york", "nyc"], country: "US", airports: ["JFK", "EWR", "LGA"], lat: 40.713, lon: -74.006 },
  { code: "MEX", name: "Ciudad de México", aliases: ["cdmx", "ciudad de mexico", "mexico df", "df", "mexico city", "ciudad de méxico"], country: "MX", airports: ["MEX", "NLU"], lat: 19.433, lon: -99.133 },
  { code: "MIL", name: "Milán", aliases: ["milan", "milano"], country: "IT", airports: ["MXP", "LIN", "BGY"], lat: 45.464, lon: 9.19 },
  { code: "ROM", name: "Roma", aliases: ["roma", "rome"], country: "IT", airports: ["FCO", "CIA"], lat: 41.903, lon: 12.496 },
  { code: "STO", name: "Estocolmo", aliases: ["estocolmo", "stockholm"], country: "SE", airports: ["ARN", "BMA", "NYO"], lat: 59.329, lon: 18.069 },
  { code: "SEL", name: "Seúl", aliases: ["seul", "seoul"], country: "KR", airports: ["ICN", "GMP"], lat: 37.566, lon: 126.978 },
  { code: "BJS", name: "Pekín", aliases: ["pekin", "beijing"], country: "CN", airports: ["PEK", "PKX"], lat: 39.904, lon: 116.407 },
  { code: "SHA", name: "Shanghái", aliases: ["shanghai", "shanghái"], country: "CN", airports: ["PVG", "SHA"], lat: 31.23, lon: 121.474 },
  { code: "MOW", name: "Moscú", aliases: ["moscu", "moscow"], country: "RU", airports: ["SVO", "DME", "VKO"], lat: 55.756, lon: 37.617 },
  { code: "WAS", name: "Washington", aliases: ["washington"], country: "US", airports: ["IAD", "DCA", "BWI"], lat: 38.907, lon: -77.037 },
  { code: "CHI", name: "Chicago", aliases: ["chicago"], country: "US", airports: ["ORD", "MDW"], lat: 41.878, lon: -87.63 },
  { code: "LAX", name: "Los Ángeles", aliases: ["los angeles", "la"], country: "US", airports: ["LAX", "BUR", "LGB", "SNA", "ONT"], lat: 34.052, lon: -118.244 },
  { code: "SFO", name: "San Francisco", aliases: ["san francisco"], country: "US", airports: ["SFO", "OAK", "SJC"], lat: 37.775, lon: -122.419 },
  { code: "MIA", name: "Miami", aliases: ["miami"], country: "US", airports: ["MIA", "FLL"], lat: 25.762, lon: -80.192 },
  { code: "HOU", name: "Houston", aliases: ["houston"], country: "US", airports: ["IAH", "HOU"], lat: 29.76, lon: -95.37 },
  { code: "DFW", name: "Dallas", aliases: ["dallas"], country: "US", airports: ["DFW", "DAL"], lat: 32.777, lon: -96.797 },
  { code: "YTO", name: "Toronto", aliases: ["toronto"], country: "CA", airports: ["YYZ", "YTZ"], lat: 43.653, lon: -79.383 },
  { code: "YMQ", name: "Montreal", aliases: ["montreal", "montréal"], country: "CA", airports: ["YUL"], lat: 45.502, lon: -73.567 },
  { code: "SAO", name: "São Paulo", aliases: ["sao paulo", "são paulo"], country: "BR", airports: ["GRU", "CGH", "VCP"], lat: -23.551, lon: -46.633 },
  { code: "RIO", name: "Río de Janeiro", aliases: ["rio", "rio de janeiro"], country: "BR", airports: ["GIG", "SDU"], lat: -22.907, lon: -43.173 },
  { code: "BUE", name: "Buenos Aires", aliases: ["buenos aires"], country: "AR", airports: ["EZE", "AEP"], lat: -34.604, lon: -58.382 },
  { code: "BER", name: "Berlín", aliases: ["berlin"], country: "DE", airports: ["BER"], lat: 52.52, lon: 13.405 },
  { code: "IST", name: "Estambul", aliases: ["estambul", "istanbul"], country: "TR", airports: ["IST", "SAW"], lat: 41.008, lon: 28.978 },
  { code: "BKK", name: "Bangkok", aliases: ["bangkok"], country: "TH", airports: ["BKK", "DMK"], lat: 13.756, lon: 100.502 },
  { code: "JKT", name: "Yakarta", aliases: ["yakarta", "jakarta"], country: "ID", airports: ["CGK", "HLP"], lat: -6.208, lon: 106.846 },
  { code: "BCN", name: "Barcelona", aliases: ["barcelona"], country: "ES", airports: ["BCN", "GRO", "REU"], lat: 41.385, lon: 2.173 },
  { code: "MAD", name: "Madrid", aliases: ["madrid"], country: "ES", airports: ["MAD"], lat: 40.417, lon: -3.704 },
  { code: "BRU", name: "Bruselas", aliases: ["bruselas", "brussels", "bruxelles"], country: "BE", airports: ["BRU", "CRL"], lat: 50.85, lon: 4.352 },
  { code: "AMS", name: "Ámsterdam", aliases: ["amsterdam", "ámsterdam"], country: "NL", airports: ["AMS"], lat: 52.368, lon: 4.904 },
  { code: "DXB", name: "Dubái", aliases: ["dubai", "dubái"], country: "AE", airports: ["DXB", "DWC"], lat: 25.204, lon: 55.271 },
  { code: "BOG", name: "Bogotá", aliases: ["bogota", "bogotá"], country: "CO", airports: ["BOG"], lat: 4.711, lon: -74.072 },
  { code: "LIM", name: "Lima", aliases: ["lima"], country: "PE", airports: ["LIM"], lat: -12.046, lon: -77.043 },
  { code: "SCL", name: "Santiago de Chile", aliases: ["santiago de chile", "santiago"], country: "CL", airports: ["SCL"], lat: -33.449, lon: -70.669 },
];

/** Alias en español de ciudades/áreas comunes que GeoNames tiene en inglés. */
export const PLACE_ALIASES: Record<string, { name: string; country: string }> = {
  "nueva delhi": { name: "New Delhi", country: "IN" },
  "pekin": { name: "Beijing", country: "CN" },
  "la habana": { name: "Havana", country: "CU" },
  "habana": { name: "Havana", country: "CU" },
  "ginebra": { name: "Geneva", country: "CH" },
  "lisboa": { name: "Lisbon", country: "PT" },
  "atenas": { name: "Athens", country: "GR" },
  "varsovia": { name: "Warsaw", country: "PL" },
  "praga": { name: "Prague", country: "CZ" },
  "viena": { name: "Vienna", country: "AT" },
  "munich": { name: "Munich", country: "DE" },
  "copenhague": { name: "Copenhagen", country: "DK" },
  "san sebastian": { name: "San Sebastián", country: "ES" },
  "donostia": { name: "San Sebastián", country: "ES" },
  "el cairo": { name: "Cairo", country: "EG" },
  "ciudad del cabo": { name: "Cape Town", country: "ZA" },
  "singapur": { name: "Singapore", country: "SG" },
  "sidney": { name: "Sydney", country: "AU" },
  "sydney": { name: "Sydney", country: "AU" },
  "kioto": { name: "Kyoto", country: "JP" },
  "cancun": { name: "Cancún", country: "MX" },
  "guadalajara": { name: "Guadalajara", country: "MX" },
  "monterrey": { name: "Monterrey", country: "MX" },
  "puebla": { name: "Puebla", country: "MX" },
  "toluca": { name: "Toluca", country: "MX" },
  "queretaro": { name: "Querétaro", country: "MX" },
  "oaxaca": { name: "Oaxaca", country: "MX" },
  "bilbao": { name: "Bilbao", country: "ES" },
  "pamplona": { name: "Pamplona", country: "ES" },
  "biarritz": { name: "Biarritz", country: "FR" },
  "zurich": { name: "Zürich", country: "CH" },
  "estrasburgo": { name: "Strasbourg", country: "FR" },
  "marsella": { name: "Marseille", country: "FR" },
  "burdeos": { name: "Bordeaux", country: "FR" },
  "florencia": { name: "Florence", country: "IT" },
  "napoles": { name: "Naples", country: "IT" },
  "venecia": { name: "Venice", country: "IT" },
  "edimburgo": { name: "Edinburgh", country: "GB" },
  "dublin": { name: "Dublin", country: "IE" },
  "nueva orleans": { name: "New Orleans", country: "US" },
  "filadelfia": { name: "Philadelphia", country: "US" },
  "vancouver": { name: "Vancouver", country: "CA" },
  "punta cana": { name: "Punta Cana", country: "DO" },
  "tenerife": { name: "Santa Cruz de Tenerife", country: "ES" },
  "gran canaria": { name: "Las Palmas de Gran Canaria", country: "ES" },
  "mallorca": { name: "Palma", country: "ES" },
  "ibiza": { name: "Ibiza", country: "ES" },
};

/** Nombres de países en español → ISO2 (para "Getaria (España)"). */
export const COUNTRY_ALIASES: Record<string, string> = {
  "espana": "ES", "spain": "ES", "francia": "FR", "mexico": "MX", "japon": "JP", "estados unidos": "US", "eeuu": "US", "ee uu": "US", "usa": "US",
  "reino unido": "GB", "inglaterra": "GB", "alemania": "DE", "italia": "IT", "portugal": "PT", "argentina": "AR", "colombia": "CO", "chile": "CL",
  "peru": "PE", "brasil": "BR", "canada": "CA", "china": "CN", "corea": "KR", "corea del sur": "KR", "tailandia": "TH", "india": "IN",
  "belgica": "BE", "paises bajos": "NL", "holanda": "NL", "suiza": "CH", "austria": "AT", "grecia": "GR", "turquia": "TR", "marruecos": "MA",
  "cuba": "CU", "republica dominicana": "DO", "guatemala": "GT", "costa rica": "CR", "panama": "PA", "ecuador": "EC", "uruguay": "UY",
  "venezuela": "VE", "bolivia": "BO", "paraguay": "PY", "irlanda": "IE", "australia": "AU", "egipto": "EG", "emiratos": "AE", "andorra": "AD",
};

export function findMetro(text: string): Metro | undefined {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return METROS.find((m) => m.code.toLowerCase() === t || m.aliases.some((a) => a.normalize("NFD").replace(/[̀-ͯ]/g, "") === t));
}

export function findMetroByAirport(iata: string): Metro | undefined {
  return METROS.find((m) => m.airports.includes(iata));
}
