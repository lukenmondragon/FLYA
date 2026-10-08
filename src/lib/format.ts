/** Formateadores para la UI (sin dependencias de servidor). */
export function money(n: number, currency: string): string {
  try {
    if (currency === "MXN") return `$${Math.round(n).toLocaleString("es-MX")} MXN`;
  return new Intl.NumberFormat(currency === "MXN" ? "es-MX" : "es-ES", { style: "currency", currency, maximumFractionDigits: 0, useGrouping: "always" }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

export function duration(min?: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function time(iso?: string): string {
  if (!iso || iso.length < 16) return "";
  return iso.slice(11, 16);
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
