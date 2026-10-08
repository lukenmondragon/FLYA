/** Destinos sugeridos para búsquedas abiertas ("a cualquier sitio cálido en noviembre"). Lista curada y corta. */
export interface Inspiration {
  iata: string;
  name: string;
  tags: string[];
  /** Meses (1-12) en los que suele hacer calor. */
  warmMonths: number[];
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const INSPIRATION: Inspiration[] = [
  { iata: "CUN", name: "Cancún", tags: ["playa", "caribe"], warmMonths: ALL },
  { iata: "PUJ", name: "Punta Cana", tags: ["playa", "caribe"], warmMonths: ALL },
  { iata: "SJU", name: "San Juan", tags: ["playa", "caribe"], warmMonths: ALL },
  { iata: "HAV", name: "La Habana", tags: ["playa", "caribe", "ciudad"], warmMonths: ALL },
  { iata: "LPA", name: "Gran Canaria", tags: ["playa", "europa"], warmMonths: ALL },
  { iata: "TFS", name: "Tenerife Sur", tags: ["playa", "europa"], warmMonths: ALL },
  { iata: "FUE", name: "Fuerteventura", tags: ["playa", "europa"], warmMonths: ALL },
  { iata: "AGP", name: "Málaga", tags: ["playa", "europa", "ciudad"], warmMonths: [4, 5, 6, 7, 8, 9, 10] },
  { iata: "FAO", name: "Faro", tags: ["playa", "europa"], warmMonths: [5, 6, 7, 8, 9, 10] },
  { iata: "RAK", name: "Marrakech", tags: ["ciudad", "africa"], warmMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { iata: "HRG", name: "Hurghada", tags: ["playa", "africa"], warmMonths: ALL },
  { iata: "DXB", name: "Dubái", tags: ["ciudad", "playa"], warmMonths: ALL },
  { iata: "BKK", name: "Bangkok", tags: ["ciudad", "asia"], warmMonths: ALL },
  { iata: "DPS", name: "Bali", tags: ["playa", "asia"], warmMonths: ALL },
  { iata: "PVR", name: "Puerto Vallarta", tags: ["playa"], warmMonths: ALL },
  { iata: "SJD", name: "Los Cabos", tags: ["playa"], warmMonths: ALL },
  { iata: "MIA", name: "Miami", tags: ["playa", "ciudad"], warmMonths: ALL },
  { iata: "CTG", name: "Cartagena de Indias", tags: ["playa", "ciudad"], warmMonths: ALL },
  { iata: "LIS", name: "Lisboa", tags: ["ciudad", "europa"], warmMonths: [5, 6, 7, 8, 9, 10] },
  { iata: "ATH", name: "Atenas", tags: ["ciudad", "europa", "playa"], warmMonths: [5, 6, 7, 8, 9, 10] },
  { iata: "BCN", name: "Barcelona", tags: ["ciudad", "europa", "playa"], warmMonths: [6, 7, 8, 9] },
  { iata: "LHR", name: "Londres", tags: ["ciudad", "europa"], warmMonths: [7, 8] },
  { iata: "CDG", name: "París", tags: ["ciudad", "europa"], warmMonths: [6, 7, 8] },
  { iata: "FCO", name: "Roma", tags: ["ciudad", "europa"], warmMonths: [5, 6, 7, 8, 9] },
  { iata: "JFK", name: "Nueva York", tags: ["ciudad"], warmMonths: [6, 7, 8] },
  { iata: "INN", name: "Innsbruck", tags: ["nieve", "europa"], warmMonths: [] },
  { iata: "GVA", name: "Ginebra", tags: ["nieve", "europa", "ciudad"], warmMonths: [] },
  { iata: "DEN", name: "Denver", tags: ["nieve"], warmMonths: [] },
  { iata: "NRT", name: "Tokio", tags: ["ciudad", "asia"], warmMonths: [6, 7, 8] },
];

export function pickInspiration(tags: string[], month: number | undefined, homeCountryAirports: Set<string>, limit: number): Inspiration[] {
  const wantsWarm = tags.some((t) => /calid|calor|sol|playa|caribe/.test(t));
  const otherTags = tags.filter((t) => !/calid|calor|sol/.test(t));
  return INSPIRATION.filter((d) => !homeCountryAirports.has(d.iata))
    .filter((d) => !wantsWarm || month === undefined || d.warmMonths.includes(month))
    .filter((d) => !otherTags.length || otherTags.some((t) => d.tags.includes(t)))
    .slice(0, limit);
}
