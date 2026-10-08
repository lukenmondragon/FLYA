"use client";

import type { AnalyzedOffer, Leg, Trap } from "@/lib/schema/flight";
import { clock, duration, money, shortDate, time } from "@/lib/format";
import { t } from "@/lib/i18n/es";
import { airlineName as airlineLabel } from "@/lib/providers/airlines";

const TRAP_STYLE: Partial<Record<Trap["kind"], "danger" | "warn">> = {
  self_transfer: "danger",
  airport_change: "danger",
  tight_connection: "danger",
  overnight_layover: "warn",
  long_layover: "warn",
  baggage_not_included: "warn",
  far_airport: "warn",
  many_stops: "warn",
  baggage_unknown: "warn",
};

/** Agrupa alertas repetidas (p. ej. escala nocturna a la ida y a la vuelta). */
function groupTraps(traps: Trap[]): { trap: Trap; count: number; extra: number }[] {
  const out = new Map<string, { trap: Trap; count: number; extra: number }>();
  for (const tr of traps) {
    const g = out.get(tr.kind);
    if (g) {
      g.count++;
      g.extra += tr.estimatedExtraCost ?? 0;
      g.trap = { ...g.trap, detail: `${g.trap.detail}; ${tr.detail}` };
    } else out.set(tr.kind, { trap: tr, count: 1, extra: tr.estimatedExtraCost ?? 0 });
  }
  return [...out.values()];
}

function LegRow({ label, leg }: { label: string; leg: Leg }) {
  const dep = time(leg.departAt);
  const arr = time(leg.arriveAt);
  return (
    <div className="grid grid-cols-[3.5rem_1fr] gap-x-3 text-sm">
      <span className="pt-0.5 text-xs uppercase tracking-wide text-muted">{label}</span>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{shortDate(leg.departAt)}</span>
          {dep && (
            <span className="tabular-nums">
              {dep}
              {arr && <> → {arr}</>}
            </span>
          )}
          <span className="text-muted">
            {leg.from} → {leg.to}
          </span>
        </div>
        <div className="text-muted">
          {leg.stops === 0 ? t.direct : t.stops(leg.stops)}
          {leg.layovers.length > 0 && <> ({leg.layovers.map((l) => `${l.airport} ${duration(l.minutes)}`).join(", ")})</>}
          {leg.durationMin ? <> · {duration(leg.durationMin)}</> : null}
        </div>
      </div>
    </div>
  );
}

export function FlightCard({ offer, currency, highlight }: { offer: AnalyzedOffer; currency: string; highlight?: boolean }) {
  const airlines = offer.airlines.length ? offer.airlines : [offer.airline];
  const extra = offer.realCost - offer.price;
  return (
    <article className={`rounded-2xl border bg-card p-4 sm:p-5 ${highlight ? "border-accent/60" : "border-line/60"}`} aria-label={`Vuelo ${offer.ref}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-card-2 px-1.5 py-0.5 text-xs font-semibold text-muted">{offer.ref}</span>
            <span className="font-medium">{airlines.map(airlineLabel).join(" + ")}</span>
            {offer.deal && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink" title={`Mediana ${money(offer.deal.median, currency)} · ${offer.deal.basis}`}>
                {t.deal(Math.round(offer.deal.belowMedianPct * 100))}
              </span>
            )}
            {offer.isDemo && <span className="rounded-full border border-warn/60 px-2 py-0.5 text-xs text-warn">{t.demoBadge}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-serif text-2xl sm:text-3xl leading-none text-accent tabular-nums">{money(offer.price, currency)}</div>
          <div className="mt-1 text-xs text-muted" title={t.realCostHelp}>
            {extra > 0 ? (
              <>
                {t.realCost}: <span className="text-ink tabular-nums">{money(offer.realCost, currency)}</span>
              </>
            ) : (
              "Precio total"
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <LegRow label={t.outbound} leg={offer.outbound} />
        {offer.inbound && <LegRow label={t.inbound} leg={offer.inbound} />}
      </div>

      {offer.traps.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Alertas">
          {groupTraps(offer.traps).map(({ trap: tr, count, extra: cost }, i) => {
            const tone = TRAP_STYLE[tr.kind] === "danger" ? "border-danger/70 text-danger" : "border-warn/60 text-warn";
            return (
              <li key={i} className={`rounded-full border px-2 py-0.5 text-xs ${tone}`} title={`${tr.detail}${cost ? ` · +${money(cost, currency)} ${t.estimated}` : ""}`}>
                {tr.label}
                {count > 1 ? ` ×${count}` : ""}
                {cost ? ` · ~${money(cost, currency)}` : ""}
              </li>
            );
          })}
        </ul>
      )}

      {(offer.originTransfer && offer.originTransfer.distanceKm > 15) || (offer.destinationTransfer && offer.destinationTransfer.distanceKm > 25) ? (
        <p className="mt-3 text-xs text-muted">
          {offer.originTransfer && offer.originTransfer.distanceKm > 15 && (
            <>
              {t.transferTo} {offer.originTransfer.airport} desde {offer.originTransfer.place}: ~{offer.originTransfer.distanceKm} km, {duration(offer.originTransfer.durationMin)}, ~{money(offer.originTransfer.cost, currency)} ({t.estimated}).{" "}
            </>
          )}
          {offer.destinationTransfer && offer.destinationTransfer.distanceKm > 25 && (
            <>
              {t.transferFrom}: {offer.destinationTransfer.airport} → {offer.destinationTransfer.place} ~{offer.destinationTransfer.distanceKm} km, ~{money(offer.destinationTransfer.cost, currency)} ({t.estimated}).
            </>
          )}
        </p>
      ) : null}

      {offer.why && <p className="mt-3 text-sm leading-relaxed">{offer.why}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-3">
        <p className="text-xs text-muted">
          {t.priceDisclaimer} {t.sourceLabel}: {offer.source} · {t.updatedAt} {clock(offer.fetchedAt)}
        </p>
        {offer.deepLink && (
          <a
            href={offer.deepLink}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110"
          >
            {t.seeOffer} <span aria-hidden>↗</span>
          </a>
        )}
      </div>
      {offer.deepLink && offer.affiliateLink && <p className="mt-1 text-right text-[11px] text-muted">{t.affiliate}</p>}
    </article>
  );
}
