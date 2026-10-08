import { describe, expect, it } from "vitest";
import { parseWithRules } from "@/lib/llm/rules";
import type { SearchQuery } from "@/lib/schema/query";
import { llmToParseResult, LlmParseSchema } from "@/lib/llm/schema";

const now = new Date("2026-10-08T12:00:00Z");
const parse = (m: string, previous?: SearchQuery) => parseWithRules(m, { now, previous });

describe("parser por reglas", () => {
  it("CDMX → cualquier parte de Tokio en marzo, con Cancún opcional", () => {
    const r = parse(
      "Búscame el vuelo más barato desde CDMX o cualquier aeropuerto cercano al que sea factible llegar (si el precio lo permite, Cancún por ejemplo) a cualquier parte de Tokio, ida y vuelta, en marzo.",
    );
    expect(r.questions).toEqual([]);
    expect(r.query.origins.map((o) => o.name)).toEqual(["CDMX", "Cancún"]);
    expect(r.query.origins[1]!.optional).toBe(true);
    expect(r.query.destinations.map((d) => d.name)).toEqual(["Tokio"]);
    expect(r.query.tripType).toBe("roundtrip");
    expect(r.query.departure.month).toBe("2027-03"); // próxima ocurrencia de marzo
    expect(r.query.return).toBeUndefined();
    expect(r.query.flexibility.nearbyOrigins).toBe(true);
    expect(r.query.priorities[0]).toBe("price");
  });

  it("Getaria (España) + puedo ir al aeropuerto de Biarritz", () => {
    const r = parse("Desde Getaria (España) puedo ir al aeropuerto de Biarritz; quiero ir a Londres en noviembre sin escalas largas");
    const names = r.query.origins.map((o) => o.name);
    expect(names[0]).toMatch(/Getaria/);
    expect(names).toContain("Biarritz");
    expect(r.query.destinations[0]!.name).toBe("Londres");
    expect(r.query.constraints.maxLayoverHours).toBe(6);
    expect(r.query.constraints.directOnly).toBe(false);
    expect(r.query.departure.month).toBe("2026-11");
  });

  it("destino abierto cálido con presupuesto en euros", () => {
    const r = parse("A cualquier sitio cálido en noviembre por menos de 400 € desde Madrid");
    expect(r.query.destinationMode).toBe("anywhere");
    expect(r.query.destinationTags).toContain("calido");
    expect(r.query.budget).toEqual({ amount: 400, currency: "EUR" });
    expect(r.query.origins[0]!.name).toBe("Madrid");
  });

  it("rango de fechas, flexibilidad y maleta", () => {
    const r = parse("Madrid a Roma del 3 al 10 de diciembre, fechas flexibles ±3 días, con maleta");
    expect(r.query.origins[0]!.name).toBe("Madrid");
    expect(r.query.destinations[0]!.name).toBe("Roma");
    expect(r.query.departure).toMatchObject({ date: "2026-12-03", flexDays: 3 });
    expect(r.query.return).toMatchObject({ date: "2026-12-10" });
    expect(r.query.constraints.baggageIncluded).toBe(true);
  });

  it("solo ida, pasajeros y fines de semana largos", () => {
    const r = parse("solo ida de Bogotá a Lima en mayo para 2 adultos y 1 niño");
    expect(r.query.tripType).toBe("oneway");
    expect(r.query.passengers).toMatchObject({ adults: 2, children: 1 });
    const w = parse("desde Madrid a Lisboa fines de semana largos en junio");
    expect(w.query.longWeekends).toBe(true);
  });

  it("prioridades en orden de mención y 'prioriza X' delante", () => {
    expect(parse("vuelos comodos y baratos de Madrid a Roma").query.priorities).toEqual(["comfort", "price"]);
    expect(parse("lo mas barato posible y lo mas comodo posible, pero prioriza lo barato, de Madrid a Roma").query.priorities).toEqual(["price", "comfort"]);
    expect(parse("lo más cómodo y barato pero prioriza la comodidad, de Madrid a Roma").query.priorities[0]).toBe("comfort");
  });

  it("pregunta solo lo imprescindible", () => {
    const r = parse("quiero ir a Tokio en marzo");
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]).toMatch(/Desde qué/);
  });

  it("supone y declara fechas cuando faltan", () => {
    const r = parse("desde Madrid a París");
    expect(r.query.departure.month).toBe("2026-11");
    expect(r.assumptions.join(" ")).toMatch(/No indicas fechas/);
  });
});

describe("refinamiento", () => {
  const base = parse("El vuelo más barato desde CDMX a cualquier aeropuerto de Tokio en marzo, ida y vuelta").query;

  it("ahora solo directos", () => {
    const r = parse("ahora solo directos", base);
    expect(r.isRefinement).toBe(true);
    expect(r.query.constraints.directOnly).toBe(true);
    expect(r.query.destinations[0]!.name).toBe("Tokio");
    expect(r.query.departure.month).toBe("2027-03");
  });

  it("con maleta conserva el resto", () => {
    const r = parse("con maleta", { ...base, constraints: { ...base.constraints, directOnly: true } });
    expect(r.query.constraints.baggageIncluded).toBe(true);
    expect(r.query.constraints.directOnly).toBe(true);
  });

  it("solo Narita", () => {
    const r = parse("solo Narita", base);
    expect(r.query.constraints.onlyAirports).toEqual(["NRT"]);
  });

  it("súbeme el presupuesto a 1200 (moneda del origen)", () => {
    const r = parse("súbeme el presupuesto a 1200", base);
    expect(r.query.budget).toEqual({ amount: 1200, currency: "MXN" });
  });

  it("un destino nuevo no es refinamiento", () => {
    const r = parse("desde Madrid a Roma en mayo", base);
    expect(r.isRefinement).toBe(false);
    expect(r.query.origins[0]!.name).toBe("Madrid");
  });
});

describe("salida del LLM → esquema interno", () => {
  it("valida y recorta valores fuera de rango", () => {
    const raw = LlmParseSchema.parse({
      is_refinement: false,
      origins: [{ name: "Getaria", country: "es", iata: [], lat: 43.3, lon: -2.2, optional: false }],
      destinations: [{ name: "Tokio", country: "JP", iata: ["TYO", "bad"], lat: null, lon: null, optional: false }],
      destination_mode: "specific",
      destination_tags: [],
      trip_type: "roundtrip",
      departure_date: null,
      departure_month: "2027-03",
      flex_days: 99,
      return_date: null,
      return_month: null,
      stay_min_days: null,
      stay_max_days: null,
      long_weekends: false,
      adults: 0,
      children: 0,
      infants: 0,
      budget_amount: 1200,
      budget_currency: "mxn",
      currency: null,
      priorities: ["price"],
      direct_only: true,
      max_stops: 2,
      max_layover_hours: null,
      baggage_included: true,
      avoid_overnight_layovers: false,
      preferred_airlines: [],
      excluded_airlines: [],
      only_airports: ["nrt"],
      excluded_airports: [],
      nearby_origins: true,
      nearby_destinations: false,
      radius_km: 300,
      allow_foreign_origins: true,
      assumptions: ["Asumo 1 adulto."],
      questions: [],
    });
    const r = llmToParseResult(raw);
    expect(r.query.origins[0]).toMatchObject({ name: "Getaria", country: "ES", lat: 43.3 });
    expect(r.query.destinations[0]!.iata).toEqual(["TYO"]);
    expect(r.query.departure.flexDays).toBe(7);
    expect(r.query.passengers.adults).toBe(1);
    expect(r.query.budget).toEqual({ amount: 1200, currency: "MXN" });
    expect(r.query.constraints.maxStops).toBe(0);
    expect(r.query.constraints.onlyAirports).toEqual(["NRT"]);
  });
});

describe("salida del LLM incompleta", () => {
  it("completa campos ausentes o nulos en vez de descartar la respuesta", async () => {
    const { parseLlmOutput } = await import("@/lib/llm/schema");
    const r = llmToParseResult(parseLlmOutput({ origins: [{ name: "CDMX", iata: ["MEX"] }], destinations: ["España"], departure_month: "2026-12", priorities: null, stay_min_days: 6, stay_max_days: 8 }));
    expect(r.query.origins[0]).toMatchObject({ name: "CDMX", iata: ["MEX"] });
    expect(r.query.destinations[0]!.name).toBe("España");
    expect(r.query.departure.month).toBe("2026-12");
    expect(r.query.priorities).toEqual(["price"]);
    expect(r.query.stayDays).toEqual({ min: 6, max: 8 });
    expect(r.query.tripType).toBe("roundtrip");
  });
});
