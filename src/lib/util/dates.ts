/** Utilidades de fechas en formato ISO (YYYY-MM-DD), sin zonas horarias. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtISODate(d);
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(date: string): number {
  return parseISODate(date).getUTCDay();
}

export function todayISO(now = new Date()): string {
  return fmtISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Próxima ocurrencia de un mes (1-12) a partir de hoy: "marzo" en octubre de 2026 → 2027-03. */
export function nextMonthOccurrence(month1to12: number, now = new Date()): string {
  const y = now.getFullYear();
  const current = now.getMonth() + 1;
  const year = month1to12 < current ? y + 1 : y;
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_ES[(m ?? 1) - 1]} de ${y}`;
}
