import { describe, expect, it } from "vitest";
import { FlightOfferSchema } from "@/lib/schema/flight";
import { MockProvider } from "@/lib/providers/mock";
import { normalizeTravelpayouts } from "@/lib/providers/travelpayouts";

describe("normalización Travelpayouts", () => {
  const ticket = {
    origin: "MEX",
    destination: "TYO",
    origin_airport: "MEX",
    destination_airport: "NRT",
    price: 15890,
    airline: "AM",
    flight_number: "58",
    departure_at: "2027-03-04T23:55:00-06:00",
    return_at: "2027-03-18T16:00:00+09:00",
    transfers: 0,
    return_transfers: 1,
    duration: 1830,
    duration_to: 820,
    duration_back: 1010,
    link: "/search/MEX0403TYO18031?t=AM1",
  };
  const o = normalizeTravelpayouts(ticket, "mxn", { linkHost: "www.aviasales.com", fetchedAt: "2026-10-08T10:00:00.000Z" });

  it("produce el esquema único", () => {
    expect(() => FlightOfferSchema.parse(o)).not.toThrow();
    expect(o.outbound).toMatchObject({ from: "MEX", to: "NRT", departAt: "2027-03-04T23:55", stops: 0, durationMin: 820 });
    expect(o.inbound).toMatchObject({ from: "NRT", to: "MEX", stops: 1, durationMin: 1010 });
    expect(o.currency).toBe("MXN");
    expect(o.price).toBe(15890);
    expect(o.baggageIncluded).toBeNull(); // la API no lo informa
    expect(o.deepLink).toBe("https://www.aviasales.com/search/MEX0403TYO18031?t=AM1");
    expect(o.isDemo).toBe(false);
  });

  it("solo ida sin vuelta", () => {
    const ow = normalizeTravelpayouts({ ...ticket, return_at: null, return_transfers: null }, "eur", { linkHost: "x.com", fetchedAt: "2026-10-08T10:00:00.000Z" });
    expect(ow.inbound).toBeUndefined();
  });
});

describe("MockProvider", () => {
  const p = new MockProvider();
  const req = { origin: "MEX", destination: "NRT", departure: "2027-03", oneWay: false, directOnly: false, adults: 1, currency: "USD" };

  it("es determinista y está marcado como demostración", async () => {
    const a = await p.search(req);
    const b = await p.search(req);
    expect(a.map((x) => [x.id, x.price])).toEqual(b.map((x) => [x.id, x.price]));
    expect(a.length).toBeGreaterThan(5);
    for (const o of a) {
      expect(() => FlightOfferSchema.parse(o)).not.toThrow();
      expect(o.isDemo).toBe(true);
      expect(o.inbound).toBeDefined();
    }
  });

  it("respeta solo directos y solo ida", async () => {
    const d = await p.search({ ...req, directOnly: true, oneWay: true });
    expect(d.every((o) => o.outbound.stops === 0 && !o.inbound)).toBe(true);
  });

  it("ruta desconocida → vacío", async () => {
    expect(await p.search({ ...req, destination: "ZZZ" })).toEqual([]);
  });
});
