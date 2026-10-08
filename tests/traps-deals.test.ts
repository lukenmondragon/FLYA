import { describe, expect, it } from "vitest";
import type { FlightOffer, GroundTransfer } from "@/lib/schema/flight";
import { detectTraps, trapExtraCost } from "@/lib/search/traps";
import { computeDeal, dailyMinimums, median } from "@/lib/search/deals";

function offer(partial: Partial<FlightOffer> = {}): FlightOffer {
  return {
    id: "x",
    provider: "mock",
    source: "test",
    isDemo: true,
    airline: "AM",
    airlines: ["AM"],
    outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 0, durationMin: 840, segments: [], layovers: [] },
    baggageIncluded: true,
    selfTransfer: false,
    price: 1000,
    currency: "USD",
    originalPrice: 1000,
    originalCurrency: "USD",
    fetchedAt: "2026-10-08T10:00:00.000Z",
    ...partial,
  };
}
const ctx = { fromUsd: (x: number) => x, wantsBaggage: false, passengers: 1 };
const kinds = (o: FlightOffer, c = ctx) => detectTraps(o, c).map((t) => t.kind);

describe("detección de trampas", () => {
  it("vuelo limpio sin trampas", () => {
    expect(kinds(offer())).toEqual([]);
  });
  it("escala larga, nocturna y cambio de aeropuerto con conexión justa", () => {
    const o = offer({
      outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 1, durationMin: 1500, segments: [], layovers: [{ airport: "LGW", minutes: 420, overnight: true, changeAirportTo: "LHR" }] },
    });
    expect(kinds(o)).toEqual(expect.arrayContaining(["long_layover", "overnight_layover", "airport_change"]));
    const tight = offer({ outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 1, durationMin: 900, segments: [], layovers: [{ airport: "LGW", minutes: 120, changeAirportTo: "LHR" }] } });
    expect(kinds(tight)).toContain("tight_connection");
    const short = offer({ outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 1, durationMin: 900, segments: [], layovers: [{ airport: "LAX", minutes: 45 }] } });
    expect(kinds(short)).toContain("tight_connection");
  });
  it("escala larga inferida cuando el proveedor no da tramos", () => {
    // MEX-NRT directo ≈ 14 h; 30 h con 1 escala implica una espera muy larga.
    const o = offer({ outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 1, durationMin: 30 * 60, segments: [], layovers: [] } });
    const t = detectTraps(o, ctx).find((x) => x.kind === "long_layover")!;
    expect(t.estimated).toBe(true);
  });
  it("equipaje no incluido suma sobrecoste estimado; desconocido solo si se pide maleta", () => {
    const no = detectTraps(offer({ baggageIncluded: false }), ctx);
    expect(no[0]!.kind).toBe("baggage_not_included");
    expect(trapExtraCost(no)).toBeGreaterThan(0);
    const unknown = detectTraps(offer({ baggageIncluded: null }), ctx);
    expect(unknown[0]!.kind).toBe("baggage_unknown");
    expect(trapExtraCost(unknown)).toBe(0);
    expect(trapExtraCost(detectTraps(offer({ baggageIncluded: null }), { ...ctx, wantsBaggage: true }))).toBeGreaterThan(0);
  });
  it("autoconexión, varias escalas y aeropuerto lejano", () => {
    const far: GroundTransfer = { airport: "NRT", place: "Tokio", distanceKm: 78, durationMin: 90, cost: 25, currency: "USD", mode: "bus_tren", estimated: true };
    const o = offer({ selfTransfer: true, outbound: { from: "MEX", to: "NRT", departAt: "2027-03-04T10:00", stops: 2, durationMin: 1300, segments: [], layovers: [] } });
    expect(kinds(o, { ...ctx, destinationTransfer: far } as typeof ctx)).toEqual(expect.arrayContaining(["self_transfer", "many_stops", "far_airport"]));
  });
});

describe("chollos", () => {
  it("mediana", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("detecta precios muy por debajo de la mediana e indica la base", () => {
    const samples = [500, 520, 480, 510, 530, 495, 505, 515, 300];
    const d = computeDeal(300, samples, "test")!;
    expect(d.median).toBe(505);
    expect(d.belowMedianPct).toBeCloseTo(0.41, 2);
    expect(d.sampleSize).toBe(9);
    expect(d.basis).toBe("test");
  });
  it("no marca chollo con pocas muestras o descuento pequeño", () => {
    expect(computeDeal(300, [500, 510, 300], "x")).toBeUndefined();
    expect(computeDeal(450, [500, 520, 480, 510, 530, 495, 505, 515], "x")).toBeUndefined();
  });
  it("mínimos diarios", () => {
    const m = dailyMinimums([{ d: "a", p: 3 }, { d: "a", p: 1 }, { d: "b", p: 2 }], (x) => x.d, (x) => x.p);
    expect([...m.entries()]).toEqual([["a", 1], ["b", 2]]);
  });
});
