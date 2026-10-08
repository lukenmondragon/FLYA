import { describe, expect, it } from "vitest";
import { parseWithRules } from "@/lib/llm/rules";
import { runSearch } from "@/lib/search/engine";
import { newMetrics } from "@/lib/log";
import { applyGuardrails, templateExplanation, buildContext } from "@/lib/llm/explain";
import { MockProvider } from "@/lib/providers/mock";

const now = new Date("2026-10-08T12:00:00Z");

describe("motor de búsqueda (mock)", () => {
  it("CDMX → Tokio: resultados ordenados por coste real, alternativas solo si ahorran", async () => {
    const q = parseWithRules("El vuelo más barato desde CDMX o aeropuertos cercanos a cualquier aeropuerto de Tokio en marzo, ida y vuelta", { now }).query;
    const m = newMetrics();
    const out = await runSearch(q, m);
    expect(out.provider.isDemo).toBe(true);
    expect(out.currency).toBe("MXN");
    expect(out.primary.length).toBeGreaterThan(0);
    expect(out.origins.length).toBeGreaterThan(2);
    for (const o of out.primary) {
      expect(["MEX", "NLU"]).toContain(o.outbound.from);
      expect(["HND", "NRT"]).toContain(o.outbound.to);
      expect(o.realCost).toBeGreaterThanOrEqual(o.price);
    }
    const best = Math.min(...out.primary.map((o) => o.realCost));
    for (const a of out.alternatives) expect(a.realCost).toBeLessThan(best);
    // Orden por precio total real dentro de lo pedido (el primero es el más barato en coste real).
    expect(out.primary[0]!.realCost).toBe(best);
    expect(out.dateMatrix.length).toBeGreaterThan(5);

    // Caché caliente: la segunda vez no llama al proveedor.
    const m2 = newMetrics();
    await runSearch(q, m2);
    expect(m2.providerCalls).toBe(0);
    expect(m2.cacheHits).toBeGreaterThan(0);
  });

  it("destino país: Ciudad de México → España", async () => {
    const q = parseWithRules("desde ciudad de mexico a españa ida y vuelta en diciembre", { now }).query;
    const out = await runSearch(q, newMetrics());
    expect(out.destinations.map((d) => d.iata)).toEqual(expect.arrayContaining(["MAD", "BCN"]));
    expect(out.primary.length).toBeGreaterThan(0);
    // El traslado al llegar se calcula a la ciudad del aeropuerto, no al centro del país.
    for (const o of out.primary) expect(o.destinationTransfer!.distanceKm).toBeLessThan(80);
  });

  it("si nada cumple la estancia pedida, relaja y avisa en vez de no mostrar nada", async () => {
    const q = parseWithRules("desde Madrid a Roma en noviembre, 40 días", { now }).query;
    const out = await runSearch(q, newMetrics());
    expect(out.primary.length).toBeGreaterThan(0);
    expect(out.notices.join(" ")).toMatch(/más cercanos disponibles/);
  });

  it("refinamiento 'solo directos' filtra escalas", async () => {
    const base = parseWithRules("desde Madrid a Barcelona en noviembre", { now }).query;
    const q = parseWithRules("ahora solo directos", { now, previous: base }).query;
    const out = await runSearch(q, newMetrics());
    for (const o of [...out.primary, ...out.alternatives]) {
      expect(o.outbound.stops).toBe(0);
      expect(o.inbound?.stops ?? 0).toBe(0);
    }
  });

  it("los precios mostrados son los del proveedor convertidos, nunca del LLM", async () => {
    const q = parseWithRules("desde Madrid a Roma en noviembre solo ida en dólares", { now }).query;
    const out = await runSearch(q, newMetrics(), {}, new MockProvider());
    expect(out.currency).toBe("USD");
    const raw = await new MockProvider().search({ origin: "MAD", destination: "FCO", departure: "2026-11", oneWay: true, directOnly: false, adults: 1, currency: "USD" });
    const rawPrices = new Map(raw.map((r) => [r.id, r.price]));
    for (const o of out.primary.filter((x) => rawPrices.has(x.id))) expect(o.price).toBe(rawPrices.get(o.id));
  });
});

describe("guardrails de la explicación", () => {
  it("rechaza importes inventados y referencias inexistentes; sustituye marcadores", async () => {
    const q = parseWithRules("desde Madrid a Roma en noviembre", { now }).query;
    const out = await runSearch(q, newMetrics());
    const { offers } = buildContext(out, "x");
    const f1 = offers[0]!;
    const bad = applyGuardrails({ summary: "F1 cuesta 12 €", picks: [] }, offers, out.currency);
    expect("error" in bad).toBe(true);
    const ghost = applyGuardrails({ summary: "Te recomiendo F99", picks: [] }, offers, out.currency);
    expect("error" in ghost).toBe(true);
    const ok = applyGuardrails({ summary: "Te recomiendo F1 por {precio:F1}.", picks: [{ ref: "F1", why: "El más barato." }] }, offers, out.currency);
    expect("error" in ok).toBe(false);
    if (!("error" in ok)) {
      expect(ok.text).toContain(String(f1.price).slice(0, 2));
      expect(ok.reasons.F1).toBe("El más barato.");
    }
    const tpl = templateExplanation(out);
    expect(tpl.text).toMatch(/Te recomiendo F1/);
  });
});
