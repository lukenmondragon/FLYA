import "server-only";
import type { AnalyzedOffer } from "../schema/flight";
import type { SearchOutcome } from "../schema/api";
import { log, type SearchMetrics } from "../log";
import { airlineName } from "../providers/airlines";
import { addUsage, getLLM } from "./index";
import type { LlmExplain } from "./schema";
import { money as fmtMoney } from "../format";

function hours(min?: number): string {
  if (!min) return "?";
  return `${Math.round(min / 6) / 10} h`;
}

/** Resumen COMPACTO de los N mejores candidatos para el LLM (no se envía el JSON completo). */
export function buildContext(outcome: SearchOutcome, userMessage: string, n = 8): { text: string; offers: AnalyzedOffer[] } {
  const offers = [...outcome.primary, ...outcome.alternatives].slice(0, n);
  const bestPrimary = outcome.primary[0]?.realCost;
  const lines = offers.map((o) => {
    const legs = [o.outbound, o.inbound].filter(Boolean).map((l) => `${l!.stops === 0 ? "directo" : `${l!.stops} escala(s)`} ${hours(l!.durationMin)}`);
    const traps = o.traps.map((t) => `${t.label}${t.detail ? ` (${t.detail})` : ""}`).join("; ");
    const savings = o.isAlternative && bestPrimary ? ` ahorro_neto=${bestPrimary - o.realCost}` : "";
    return `${o.ref}|${o.outbound.from}→${o.outbound.to}|${o.outbound.departAt.slice(0, 10)}${o.inbound ? `→${o.inbound.departAt.slice(0, 10)}` : ""}|${airlineName(o.airline)}|${legs.join(" / ")}|precio=${o.price}|coste_real=${o.realCost}${savings}|${o.isAlternative ? "ALTERNATIVA" : "PEDIDO"}${o.deal ? `|CHOLLO -${Math.round(o.deal.belowMedianPct * 100)}%` : ""}${traps ? `|trampas: ${traps}` : ""}`;
  });
  const text = [
    `PETICIÓN: ${userMessage}`,
    `MONEDA: ${outcome.currency}. FUENTE: ${outcome.provider.label}${outcome.provider.isDemo ? " (DATOS DE DEMOSTRACIÓN, no reales)" : ""}`,
    `ORDEN: ${outcome.query.priorities.join(", ")}. coste_real = precio + traslados terrestres estimados + extras estimados.`,
    "VUELOS:",
    ...lines,
    outcome.notices.length ? `AVISOS: ${outcome.notices.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { text, offers };
}

const PLACEHOLDER = /\{(precio|coste_real|ahorro):(F\d+)\}/g;
const MONEY = /(?:[$€£¥]\s?\d[\d.,\s]*\d|\d[\d.,\s]*\d?\s?(?:€|\$|MXN|EUR|USD|GBP|JPY|euros?|pesos|d[oó]lares|yenes|libras))/gi;
const REF = /\bF(\d+)\b/g;

/**
 * Guardrails: (1) toda referencia F# existe; (2) ningún importe literal que no coincida con datos reales;
 * (3) los marcadores se sustituyen por valores reales. Devuelve null si hay que regenerar.
 */
export function applyGuardrails(data: LlmExplain, offers: AnalyzedOffer[], currency: string): { text: string; reasons: Record<string, string> } | { error: string } {
  const byRef = new Map(offers.map((o) => [o.ref, o]));
  const bestPrimary = offers.filter((o) => !o.isAlternative)[0]?.realCost;
  const known = new Set<number>();
  for (const o of offers) {
    known.add(o.price);
    known.add(o.realCost);
    if (bestPrimary) known.add(bestPrimary - o.realCost);
  }
  const all = [data.summary, ...data.picks.map((p) => p.why)].join(" ");
  for (const m of all.matchAll(REF)) if (!byRef.has(`F${m[1]}`)) return { error: `cita F${m[1]}, que no existe` };
  for (const m of all.matchAll(MONEY)) {
    const num = Number(m[0].replace(/[^\d,.]/g, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (!Number.isFinite(num)) continue;
    const ok = [...known].some((k) => Math.abs(k - num) <= Math.max(1, Math.abs(k) * 0.01));
    if (!ok) return { error: `menciona un importe (${m[0].trim()}) que no coincide con los resultados` };
  }
  const fill = (s: string) =>
    s.replace(PLACEHOLDER, (_, kind: string, ref: string) => {
      const o = byRef.get(ref);
      if (!o) return "";
      if (kind === "precio") return fmtMoney(o.price, currency);
      if (kind === "coste_real") return fmtMoney(o.realCost, currency);
      return bestPrimary !== undefined ? fmtMoney(Math.max(0, bestPrimary - o.realCost), currency) : "";
    });
  const reasons: Record<string, string> = {};
  for (const p of data.picks) if (byRef.has(p.ref)) reasons[p.ref] = fill(p.why).slice(0, 400);
  return { text: fill(data.summary).slice(0, 800), reasons };
}

/** Explicaciones por plantilla (sin IA), siempre a partir de los datos reales. */
export function templateExplanation(outcome: SearchOutcome): { text: string; reasons: Record<string, string> } {
  const cur = outcome.currency;
  const reasons: Record<string, string> = {};
  const best = outcome.primary[0];
  for (const o of [...outcome.primary, ...outcome.alternatives]) {
    const parts: string[] = [];
    const stops = o.outbound.stops + (o.inbound?.stops ?? 0);
    if (o === best) parts.push(outcome.query.priorities[0] === "price" || !outcome.query.priorities.length ? "El más barato en coste real" : "El mejor según tus prioridades");
    parts.push(stops === 0 ? "vuelos directos" : `${stops} escala${stops > 1 ? "s" : ""} en total`);
    if (o.isAlternative && best) {
      const diff = best.realCost - o.realCost;
      parts.push(diff > 0 ? `sale desde/hacia ${o.outbound.from}/${o.outbound.to} y ahorras ~${fmtMoney(diff, cur)} netos incluso con el traslado estimado` : "el ahorro no compensa el traslado");
    }
    if (o.deal) parts.push(`${Math.round(o.deal.belowMedianPct * 100)} % por debajo de la mediana de la ruta`);
    const worst = o.traps.find((t) => ["self_transfer", "airport_change", "overnight_layover", "long_layover", "baggage_not_included", "far_airport"].includes(t.kind));
    if (worst) parts.push(`ojo: ${worst.label.toLowerCase()}`);
    reasons[o.ref] = parts.join("; ") + ".";
  }
  let text: string;
  if (!best && !outcome.alternatives.length) text = "No he encontrado vuelos que encajen.";
  else if (!best) text = `No hay vuelos desde/hacia lo que pediste, pero sí alternativas: la mejor (${outcome.alternatives[0]!.ref}) cuesta ${fmtMoney(outcome.alternatives[0]!.realCost, cur)} en coste real.`;
  else {
    text = `Te recomiendo ${best.ref} (${airlineName(best.airline)}, ${fmtMoney(best.price, cur)}; coste real estimado ${fmtMoney(best.realCost, cur)}).`;
    const alt = outcome.alternatives[0];
    if (alt) text += ` Saliendo desde ${alt.outbound.from} podrías ahorrar ~${fmtMoney(best.realCost - alt.realCost, cur)} netos (${alt.ref}).`;
    else text += " Ningún aeropuerto alternativo compensa en coste real.";
  }
  return { text, reasons };
}

/** Explicación con LLM + guardrails; un reintento si viola las reglas; si no, plantilla. */
export async function explain(outcome: SearchOutcome, userMessage: string, metrics: SearchMetrics): Promise<{ text: string; reasons: Record<string, string>; source: "llm" | "plantilla" }> {
  const llm = getLLM();
  const offers = [...outcome.primary, ...outcome.alternatives];
  if (!llm || !offers.length) return { ...templateExplanation(outcome), source: "plantilla" };
  const { text: context, offers: top } = buildContext(outcome, userMessage);
  let extra: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, usage } = await llm.explain(context, extra);
      addUsage(metrics, usage);
      const g = applyGuardrails(data, top, outcome.currency);
      if ("error" in g) {
        log.warn("Guardrail: explicación descartada", { attempt, reason: g.error });
        extra = `Tu respuesta anterior se descartó porque ${g.error}. Usa solo marcadores {precio:F#} y referencias existentes.`;
        continue;
      }
      // Completa con plantilla los vuelos que el LLM no comentó.
      const tpl = templateExplanation(outcome).reasons;
      return { text: g.text, reasons: { ...tpl, ...g.reasons }, source: "llm" };
    } catch (e) {
      log.warn("LLM explain falló", { error: String(e) });
      break;
    }
  }
  return { ...templateExplanation(outcome), source: "plantilla" };
}
