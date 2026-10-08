// Genera los datasets compactos de /data a partir de fuentes abiertas:
//  - Aeropuertos: OurAirports (https://ourairports.com/data/, dominio público).
//    Se intenta descargar el CSV oficial; si no hay red, se usa el paquete npm
//    `airports-json`, que es un volcado de OurAirports (aeropuertos medianos y grandes).
//  - Ciudades/lugares: GeoNames (CC-BY 4.0) vía el paquete npm `all-the-cities` (pob. >= 2000).
//  - Países (nombre en español, moneda, fronteras): paquete npm `world-countries` (ODbL).
// Uso: npm run data:build
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const OUT = path.resolve(import.meta.dirname, "../data");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vuelos-data-"));

function pack(name) {
  execSync(`npm pack ${name} --silent`, { cwd: TMP, stdio: ["ignore", "pipe", "inherit"] });
  const tgz = fs.readdirSync(TMP).find((f) => f.startsWith(name.replace("@", "").replace("/", "-")) && f.endsWith(".tgz"));
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  execSync(`tar xzf ${tgz} -C ${dir}`, { cwd: TMP });
  return path.join(dir, "package");
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

async function loadAirports() {
  try {
    const res = await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv", { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("Aeropuertos: CSV oficial de OurAirports");
    return { rows: parseCsv(await res.text()), source: "ourairports.com (CSV)" };
  } catch (e) {
    console.log(`No se pudo descargar OurAirports (${e.message}); usando paquete npm airports-json`);
    const dir = pack("airports-json");
    return { rows: JSON.parse(fs.readFileSync(path.join(dir, "data/airports.json"), "utf8")), source: "ourairports.com vía npm airports-json" };
  }
}

const { rows, source } = await loadAirports();
const airports = rows
  .filter((a) => a.iata_code && /^[A-Z]{3}$/.test(a.iata_code) && (a.type === "large_airport" || a.type === "medium_airport"))
  .map((a) => [
    a.iata_code,
    a.name,
    a.municipality || "",
    a.iso_country,
    Math.round(parseFloat(a.latitude_deg) * 1e4) / 1e4,
    Math.round(parseFloat(a.longitude_deg) * 1e4) / 1e4,
    a.type === "large_airport" ? "L" : "M",
    a.scheduled_service === "yes" ? 1 : 0,
  ]);
fs.writeFileSync(
  path.join(OUT, "airports.json"),
  JSON.stringify({ source, generatedAt: new Date().toISOString(), fields: ["iata", "name", "city", "country", "lat", "lon", "size", "scheduled"], rows: airports }),
);
console.log(`airports.json: ${airports.length} aeropuertos`);

// Países
const wc = pack("world-countries");
const countries = JSON.parse(fs.readFileSync(path.join(wc, "countries.json"), "utf8"));
const cca3to2 = Object.fromEntries(countries.map((c) => [c.cca3, c.cca2]));
const countryOut = {};
for (const c of countries) {
  countryOut[c.cca2] = {
    es: c.translations?.spa?.common ?? c.name.common,
    en: c.name.common,
    currency: Object.keys(c.currencies ?? {})[0] ?? "USD",
    borders: (c.borders ?? []).map((b) => cca3to2[b]).filter(Boolean),
    region: c.region,
  };
}
fs.writeFileSync(path.join(OUT, "countries.json"), JSON.stringify(countryOut));
console.log(`countries.json: ${Object.keys(countryOut).length} países`);

// Lugares (GeoNames)
const atc = pack("all-the-cities");
execSync("npm install pbf@3 --no-save --silent", { cwd: atc, stdio: "inherit" });
const require = createRequire(path.join(atc, "index.js"));
const cities = require(path.join(atc, "index.js"));
const lines = cities
  .filter((c) => c.population >= 2000)
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name.replace(/\t/g, " "), c.country, c.loc.coordinates[1].toFixed(3), c.loc.coordinates[0].toFixed(3), c.population].join("\t"));
fs.writeFileSync(path.join(OUT, "places.tsv"), "# GeoNames (CC-BY 4.0) via all-the-cities. name\tcountry\tlat\tlon\tpopulation\n" + lines.join("\n") + "\n");
console.log(`places.tsv: ${lines.length} lugares`);
fs.rmSync(TMP, { recursive: true, force: true });
