/**
 * Evaluación del intérprete: 18 consultas en español → ¿sale bien el JSON estructurado?
 * Usa el LLM configurado en .env.local (o el parser por reglas si no hay claves).
 *   npm run eval            → parser configurado (LLM si hay clave)
 *   npm run eval -- --rules → fuerza el parser por reglas
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
if (process.argv.includes("--rules")) process.env.LLM_PROVIDER = "rules";
process.env.LOG_LEVEL ??= "warn";

import type { SearchQuery } from "../src/lib/schema/query";
import { interpret } from "../src/lib/llm";
import { newMetrics } from "../src/lib/log";
import { nextMonthOccurrence } from "../src/lib/util/dates";
import { resolvePlace } from "../src/lib/geo/resolve";

type Check = [string, (q: SearchQuery, r: { questions: string[]; isRefinement: boolean }) => boolean];
interface Case {
  message: string;
  previous?: string;
  checks: Check[];
}

const m = (n: number) => nextMonthOccurrence(n);
const airportsOf = (refs: SearchQuery["origins"]) => refs.flatMap((r) => resolvePlace(r)?.airports ?? []);
const hasOrigin = (code: string): Check => [`origen incluye ${code}`, (q) => airportsOf(q.origins).includes(code)];
const hasDest = (code: string): Check => [`destino incluye ${code}`, (q) => airportsOf(q.destinations).includes(code)];
const month = (mm: number): Check => [`salida en ${m(mm)}`, (q) => q.departure.month === m(mm) || (q.departure.date ?? "").startsWith(m(mm))];

const CASES: Case[] = [
  {
    message: "Búscame el vuelo más barato desde CDMX o cualquier aeropuerto cercano al que sea factible llegar (si el precio lo permite, Cancún por ejemplo) a cualquier parte de Tokio, ida y vuelta, en marzo.",
    checks: [hasOrigin("MEX"), hasDest("NRT"), hasDest("HND"), month(3), ["ida y vuelta", (q) => q.tripType === "roundtrip"], ["Cancún opcional", (q) => q.origins.some((o) => /canc/i.test(o.name) && o.optional === true)], ["aeropuertos cercanos", (q) => q.flexibility.nearbyOrigins], ["sin preguntas", (_q, r) => r.questions.length === 0]],
  },
  {
    message: "Desde Getaria (España) puedo ir al aeropuerto de Biarritz, quiero ir a Londres en noviembre",
    checks: [["origen Getaria", (q) => q.origins.some((o) => /getaria/i.test(o.name))], hasOrigin("BIQ"), hasDest("LHR"), month(11)],
  },
  { message: "vuelos de Madrid a Nueva York sin escalas en junio", checks: [hasOrigin("MAD"), hasDest("JFK"), month(6), ["directo", (q) => q.constraints.directOnly]] },
  { message: "Barcelona - Lisboa solo ida el 14 de febrero", checks: [hasOrigin("BCN"), hasDest("LIS"), ["solo ida", (q) => q.tripType === "oneway"], ["fecha 14/02", (q) => (q.departure.date ?? "").endsWith("-02-14")]] },
  { message: "a cualquier sitio cálido en noviembre por menos de 400 € desde Madrid", checks: [hasOrigin("MAD"), ["destino abierto", (q) => q.destinationMode === "anywhere"], ["etiqueta cálido", (q) => q.destinationTags.some((t) => /c[aá]lid|calor|sol|playa/.test(t))], ["presupuesto 400 EUR", (q) => q.budget?.amount === 400 && q.budget.currency === "EUR"]] },
  { message: "Bogotá a Ciudad de México del 3 al 12 de mayo con maleta incluida", checks: [hasOrigin("BOG"), hasDest("MEX"), ["fecha ida 03/05", (q) => (q.departure.date ?? "").endsWith("-05-03")], ["fecha vuelta 12/05", (q) => (q.return?.date ?? "").endsWith("-05-12")], ["maleta", (q) => q.constraints.baggageIncluded]] },
  { message: "quiero ir de Lima a Cusco en julio, fechas flexibles ±3 días", checks: [hasOrigin("LIM"), hasDest("CUZ"), month(7)] },
  { message: "Sevilla a Londres fines de semana largos en abril", checks: [hasOrigin("SVQ"), ["fines de semana largos", (q) => q.longWeekends], month(4)] },
  { message: "dos adultos y un niño desde Monterrey a Cancún en diciembre", checks: [hasOrigin("MTY"), hasDest("CUN"), ["2 adultos", (q) => q.passengers.adults === 2], ["1 niño", (q) => q.passengers.children === 1], month(12)] },
  { message: "el vuelo más rápido de París a Roma en septiembre", checks: [hasOrigin("CDG"), hasDest("FCO"), ["prioridad duración", (q) => q.priorities[0] === "duration"]] },
  { message: "Buenos Aires a Madrid en octubre, sin escalas largas", checks: [hasOrigin("EZE"), hasDest("MAD"), ["escalas ≤ 6 h", (q) => (q.constraints.maxLayoverHours ?? 99) <= 6]] },
  { message: "Guadalajara a Los Ángeles en agosto con presupuesto de 5000 pesos", checks: [hasOrigin("GDL"), hasDest("LAX"), ["presupuesto 5000 MXN", (q) => q.budget?.amount === 5000 && q.budget.currency === "MXN"]] },
  { message: "MAD-BCN el 2 de marzo", checks: [hasOrigin("MAD"), hasDest("BCN")] },
  { message: "quiero ir a Tokio en marzo", checks: [["pregunta el origen", (_q, r) => r.questions.length >= 1]] },
  { message: "desde Bilbao a Ámsterdam en enero, una semana", checks: [hasOrigin("BIO"), hasDest("AMS"), ["estancia ~7 días", (q) => !!q.stayDays && q.stayDays.min <= 7 && q.stayDays.max >= 7]] },
  // Refinamientos (sobre la consulta previa)
  { previous: "desde CDMX a Tokio en marzo ida y vuelta", message: "ahora solo directos", checks: [["es refinamiento", (_q, r) => r.isRefinement], ["directo", (q) => q.constraints.directOnly], hasDest("NRT"), month(3)] },
  { previous: "desde CDMX a Tokio en marzo ida y vuelta", message: "solo Narita", checks: [["solo NRT", (q) => q.constraints.onlyAirports.join() === "NRT"], hasOrigin("MEX")] },
  { previous: "desde CDMX a Tokio en marzo ida y vuelta por menos de 900 dólares", message: "súbeme el presupuesto a 1200", checks: [["presupuesto 1200", (q) => q.budget?.amount === 1200], hasDest("HND")] },
];

async function main() {
  let passed = 0;
  let total = 0;
  let parserName = "";
  const metrics = newMetrics();
  const started = Date.now();
  for (const c of CASES) {
    const prev = c.previous ? (await interpret(c.previous, undefined, undefined, metrics)).result.query : undefined;
    const { result, parser } = await interpret(c.message, prev, c.previous ? [c.previous] : undefined, metrics);
    parserName = parser;
    const fails = c.checks.filter(([, fn]) => {
      try {
        return !fn(result.query, result);
      } catch {
        return true;
      }
    });
    total += c.checks.length;
    passed += c.checks.length - fails.length;
    console.log(`${fails.length ? "✗" : "✓"} ${c.previous ? `[${c.previous}] → ` : ""}${c.message}`);
    for (const [name] of fails) console.log(`    falla: ${name}`);
  }
  console.log(`\nParser: ${parserName}`);
  console.log(`Comprobaciones: ${passed}/${total} (${Math.round((passed / total) * 100)} %) · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (metrics.llmInputTokens) console.log(`Tokens: ${metrics.llmInputTokens} entrada (${metrics.llmCachedTokens} de caché), ${metrics.llmOutputTokens} salida · coste estimado $${metrics.llmCostUsd.toFixed(5)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
