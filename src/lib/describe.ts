import type { SearchQuery } from "./schema/query";
import { MONTHS_ES } from "./util/dates";

/** Resumen legible de la consulta estructurada (chips bajo la respuesta). */
export function describeQuery(q: SearchQuery): string[] {
  const chips: string[] = [];
  const place = (p: SearchQuery["origins"][number]) => `${p.name}${p.optional ? " (si compensa)" : ""}`;
  chips.push(`Desde ${q.origins.map(place).join(" o ") || "?"}`);
  chips.push(q.destinationMode === "anywhere" && !q.destinations.length ? `A cualquier sitio${q.destinationTags.length ? ` (${q.destinationTags.join(", ")})` : ""}` : `A ${q.destinations.map(place).join(" o ")}`);
  chips.push(q.tripType === "roundtrip" ? "Ida y vuelta" : "Solo ida");
  if (q.departure.date) chips.push(`Salida ${q.departure.date}${q.departure.flexDays ? ` ±${q.departure.flexDays} d` : ""}`);
  else if (q.departure.month) {
    const [y, m] = q.departure.month.split("-");
    chips.push(`En ${MONTHS_ES[Number(m) - 1]} ${y}`);
  }
  if (q.return?.date) chips.push(`Vuelta ${q.return.date}`);
  if (q.stayDays) chips.push(`${q.stayDays.min}-${q.stayDays.max} días`);
  if (q.longWeekends) chips.push("Fines de semana largos");
  const pax = q.passengers.adults + q.passengers.children + q.passengers.infants;
  if (pax > 1) chips.push(`${pax} pasajeros`);
  if (q.constraints.directOnly) chips.push("Solo directos");
  else if (q.constraints.maxStops !== undefined) chips.push(`Máx. ${q.constraints.maxStops} escala(s)`);
  if (q.constraints.maxLayoverHours) chips.push(`Escalas ≤ ${q.constraints.maxLayoverHours} h`);
  if (q.constraints.baggageIncluded) chips.push("Con maleta");
  if (q.constraints.onlyAirports.length) chips.push(`Solo ${q.constraints.onlyAirports.join(", ")}`);
  if (q.constraints.excludedAirlines.length) chips.push(`Sin ${q.constraints.excludedAirlines.join(", ")}`);
  if (q.budget) chips.push(`Máx. ${q.budget.amount} ${q.budget.currency}`);
  if (q.flexibility.nearbyOrigins) chips.push(`Aeropuertos ≤ ${q.flexibility.radiusKm} km`);
  const prio: Record<string, string> = { price: "precio", duration: "duración", comfort: "comodidad", schedule: "horarios", airline: "aerolínea" };
  chips.push(`Orden: ${q.priorities.map((p) => prio[p]).join(" > ")}`);
  return chips;
}
