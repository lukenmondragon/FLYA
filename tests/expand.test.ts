import { describe, expect, it } from "vitest";
import { resolvePlace } from "@/lib/geo/resolve";
import { expandAirports } from "@/lib/geo/expand";
import { haversineKm } from "@/lib/geo/distance";

const opts = { nearby: true, radiusKm: 300, allowForeign: true, max: 8 };

describe("Haversine", () => {
  it("MAD-BCN ≈ 483 km", () => {
    expect(haversineKm(40.4719, -3.5626, 41.2971, 2.0785)).toBeGreaterThan(470);
    expect(haversineKm(40.4719, -3.5626, 41.2971, 2.0785)).toBeLessThan(495);
  });
});

describe("resolución de lugares", () => {
  it("CDMX es una ciudad-área con MEX y NLU", () => {
    const r = resolvePlace({ name: "CDMX" })!;
    expect(r.via).toBe("metro");
    expect(r.airports).toEqual(["MEX", "NLU"]);
  });
  it("Getaria (pueblo sin aeropuerto) se geolocaliza con GeoNames", () => {
    const r = resolvePlace({ name: "Getaria (España)" })!;
    expect(r.via).toBe("gazetteer");
    expect(r.country).toBe("ES");
    expect(r.airports).toContain("EAS");
  });
  it("«aeropuerto de Biarritz» → BIQ", () => {
    expect(resolvePlace({ name: "aeropuerto de Biarritz" })!.airports).toContain("BIQ");
  });
  it("Tokio → HND + NRT; código IATA directo", () => {
    expect(resolvePlace({ name: "Tokio" })!.airports.sort()).toEqual(["HND", "NRT"]);
    expect(resolvePlace({ name: "NRT" })!.airports).toEqual(["NRT"]);
  });
  it("coordenadas del LLM como último recurso", () => {
    const r = resolvePlace({ name: "Pueblo Inventado", lat: 43.3, lon: -2.2, country: "ES" })!;
    expect(r.via).toBe("llm_coords");
  });
  it("países → aeropuertos principales (y no un pueblo homónimo)", () => {
    const es = resolvePlace({ name: "España" })!;
    expect(es.via).toBe("country");
    expect(es.country).toBe("ES");
    expect(es.airports).toEqual(expect.arrayContaining(["MAD", "BCN"]));
    expect(resolvePlace({ name: "Japón" })!.airports).toContain("HND");
    expect(resolvePlace({ name: "spain" })!.country).toBe("ES");
  });
  it("lugar desconocido → undefined", () => {
    expect(resolvePlace({ name: "Xyzzyplatz" })).toBeUndefined();
  });
});

describe("expansión por radio", () => {
  it("CDMX: incluye TLC y PBC como alternativas, pedidos primero", () => {
    const c = expandAirports([resolvePlace({ name: "CDMX" })!], opts);
    const codes = c.map((x) => x.iata);
    expect(codes.slice(0, 2)).toEqual(["MEX", "NLU"]);
    expect(codes).toEqual(expect.arrayContaining(["TLC", "PBC"]));
    expect(c.find((x) => x.iata === "TLC")!.requested).toBe(false);
    expect(c.every((x) => x.distanceKm <= 300)).toBe(true);
  });
  it("Getaria: San Sebastián, Bilbao, Pamplona y Biarritz (Francia es país fronterizo)", () => {
    const c = expandAirports([resolvePlace({ name: "Getaria", country: "ES" })!], opts).map((x) => x.iata);
    expect(c).toEqual(expect.arrayContaining(["EAS", "BIO", "PNA", "BIQ"]));
  });
  it("sin países vecinos no aparece Biarritz", () => {
    const c = expandAirports([resolvePlace({ name: "Getaria", country: "ES" })!], { ...opts, allowForeign: false }).map((x) => x.iata);
    expect(c).not.toContain("BIQ");
  });
  it("radio pequeño reduce la lista", () => {
    const c = expandAirports([resolvePlace({ name: "CDMX" })!], { ...opts, radiusKm: 60 }).map((x) => x.iata);
    expect(c).not.toContain("PBC");
    expect(c).not.toContain("QRO");
  });
  it("respeta el máximo y nunca descarta lo pedido", () => {
    const c = expandAirports([resolvePlace({ name: "Londres" })!], { ...opts, max: 2 });
    expect(c.filter((x) => x.requested).length).toBeGreaterThanOrEqual(5);
  });
  it("onlyAirports restringe ('solo Narita')", () => {
    const c = expandAirports([resolvePlace({ name: "Tokio" })!], { ...opts, nearby: false, onlyAirports: ["NRT"] });
    expect(c.map((x) => x.iata)).toEqual(["NRT"]);
  });
  it("origen opcional (Cancún si compensa) entra como alternativa", () => {
    const c = expandAirports([resolvePlace({ name: "CDMX" })!, resolvePlace({ name: "Cancún", optional: true })!], opts);
    const cun = c.find((x) => x.iata === "CUN");
    expect(cun).toBeDefined();
    expect(cun!.requested).toBe(false);
  });
});
