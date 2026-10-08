/** Nombres de aerolíneas por código IATA (los proveedores de precios en caché solo dan el código). */
export const AIRLINES: Record<string, { name: string; lowCost?: boolean }> = {
  AM: { name: "Aeroméxico" }, Y4: { name: "Volaris", lowCost: true }, VB: { name: "Viva Aerobus", lowCost: true },
  AA: { name: "American Airlines" }, UA: { name: "United" }, DL: { name: "Delta" }, AS: { name: "Alaska Airlines" }, WN: { name: "Southwest", lowCost: true },
  NK: { name: "Spirit", lowCost: true }, F9: { name: "Frontier", lowCost: true }, B6: { name: "JetBlue" }, AC: { name: "Air Canada" }, WS: { name: "WestJet" },
  JL: { name: "Japan Airlines" }, NH: { name: "ANA" }, ZG: { name: "ZIPAIR", lowCost: true }, MM: { name: "Peach", lowCost: true }, GK: { name: "Jetstar Japan", lowCost: true },
  KE: { name: "Korean Air" }, OZ: { name: "Asiana" }, CX: { name: "Cathay Pacific" }, SQ: { name: "Singapore Airlines" }, CA: { name: "Air China" }, MU: { name: "China Eastern" }, CZ: { name: "China Southern" },
  BR: { name: "EVA Air" }, CI: { name: "China Airlines" }, TG: { name: "Thai Airways" }, QR: { name: "Qatar Airways" }, EK: { name: "Emirates" }, EY: { name: "Etihad" }, TK: { name: "Turkish Airlines" },
  IB: { name: "Iberia" }, I2: { name: "Iberia Express" }, UX: { name: "Air Europa" }, VY: { name: "Vueling", lowCost: true }, V7: { name: "Volotea", lowCost: true }, FR: { name: "Ryanair", lowCost: true },
  U2: { name: "easyJet", lowCost: true }, W6: { name: "Wizz Air", lowCost: true }, AF: { name: "Air France" }, KL: { name: "KLM" }, LH: { name: "Lufthansa" }, LX: { name: "SWISS" }, OS: { name: "Austrian" },
  SN: { name: "Brussels Airlines" }, BA: { name: "British Airways" }, VS: { name: "Virgin Atlantic" }, AY: { name: "Finnair" }, SK: { name: "SAS" }, AZ: { name: "ITA Airways" }, TP: { name: "TAP Air Portugal" },
  LA: { name: "LATAM" }, AV: { name: "Avianca" }, CM: { name: "Copa Airlines" }, AR: { name: "Aerolíneas Argentinas" }, G3: { name: "GOL", lowCost: true }, AD: { name: "Azul" }, JA: { name: "JetSMART", lowCost: true },
  H2: { name: "SKY Airline", lowCost: true }, QF: { name: "Qantas" }, NZ: { name: "Air New Zealand" }, HA: { name: "Hawaiian Airlines" }, TO: { name: "Transavia", lowCost: true }, HV: { name: "Transavia", lowCost: true },
  EW: { name: "Eurowings", lowCost: true }, DY: { name: "Norwegian", lowCost: true }, BT: { name: "airBaltic" }, LO: { name: "LOT" }, A3: { name: "Aegean" }, PC: { name: "Pegasus", lowCost: true },
  AT: { name: "Royal Air Maroc" }, MS: { name: "EgyptAir" }, ET: { name: "Ethiopian" }, AI: { name: "Air India" }, "6E": { name: "IndiGo", lowCost: true }, VJ: { name: "VietJet", lowCost: true },
  AK: { name: "AirAsia", lowCost: true }, D7: { name: "AirAsia X", lowCost: true }, "5J": { name: "Cebu Pacific", lowCost: true }, PR: { name: "Philippine Airlines" }, VN: { name: "Vietnam Airlines" },
};

export function airlineName(code: string): string {
  return AIRLINES[code]?.name ?? code;
}

export function isLowCost(code: string): boolean {
  return !!AIRLINES[code]?.lowCost;
}
