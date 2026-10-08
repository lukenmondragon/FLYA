import fs from "node:fs";
import path from "node:path";

/** Carga los datasets de /data una sola vez por proceso (lazy). */
const DATA_DIR = path.join(process.cwd(), "data");

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  size: "L" | "M";
  scheduled: boolean;
}

export interface Country {
  es: string;
  en: string;
  currency: string;
  borders: string[];
  region: string;
}

export interface Place {
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
}

let airports: Airport[] | undefined;
let airportByIata: Map<string, Airport> | undefined;
let countries: Record<string, Country> | undefined;
let places: Place[] | undefined;

export function getAirports(): Airport[] {
  if (!airports) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "airports.json"), "utf8")) as {
      rows: [string, string, string, string, number, number, "L" | "M", 0 | 1][];
    };
    airports = raw.rows.map(([iata, name, city, country, lat, lon, size, scheduled]) => ({ iata, name, city, country, lat, lon, size, scheduled: scheduled === 1 }));
    airportByIata = new Map(airports.map((a) => [a.iata, a]));
  }
  return airports;
}

export function getAirport(iata: string): Airport | undefined {
  getAirports();
  return airportByIata!.get(iata.toUpperCase());
}

export function getCountries(): Record<string, Country> {
  if (!countries) countries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "countries.json"), "utf8")) as Record<string, Country>;
  return countries;
}

export function getCountry(cc: string): Country | undefined {
  return getCountries()[cc.toUpperCase()];
}

export function getPlaces(): Place[] {
  if (!places) {
    const text = fs.readFileSync(path.join(DATA_DIR, "places.tsv"), "utf8");
    places = [];
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [name, country, lat, lon, pop] = line.split("\t");
      places.push({ name: name!, country: country!, lat: Number(lat), lon: Number(lon), population: Number(pop) });
    }
  }
  return places;
}
