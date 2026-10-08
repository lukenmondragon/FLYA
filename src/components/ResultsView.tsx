"use client";

import type { SearchOutcome } from "@/lib/schema/api";
import { money, shortDate, clock } from "@/lib/format";
import { t } from "@/lib/i18n/es";
import { FlightCard } from "./FlightCard";

export function ResultsView({ outcome, reasons }: { outcome: SearchOutcome; reasons: Record<string, string> }) {
  const cur = outcome.currency;
  const withWhy = <T extends { ref: string; why?: string }>(o: T): T => ({ ...o, why: reasons[o.ref] ?? o.why });
  const cheapestDay = outcome.dateMatrix.length ? Math.min(...outcome.dateMatrix.map((d) => d.price)) : undefined;
  const hasAnchor = outcome.dateMatrix.some((d) => d.delta !== undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {outcome.provider.isDemo ? (
          <span className="rounded-full border border-warn/60 px-2 py-0.5 text-warn">{t.demoBadge}</span>
        ) : (
          <span className="rounded-full border border-line px-2 py-0.5">
            {t.sourceLabel}: {outcome.provider.label}
          </span>
        )}
        <span>
          {t.updatedAt} {clock(outcome.fetchedAt)} · {outcome.stats.offersSeen} precios vistos · {outcome.stats.providerCalls} consultas al proveedor, {outcome.stats.cacheHits} desde caché · {(outcome.stats.ms / 1000).toFixed(1)} s
        </span>
      </div>

      {outcome.provider.isDemo && <p className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm text-warn">{t.demoNotice}</p>}

      {outcome.notices.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {outcome.notices.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}

      {outcome.dateMatrix.length > 1 && (
        <section aria-label={hasAnchor ? t.datesTitle : t.datesTitleMonth}>
          <h3 className="mb-2 text-sm font-medium text-muted">{hasAnchor ? t.datesTitle : t.datesTitleMonth}</h3>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {outcome.dateMatrix.map((d) => (
              <div key={d.date} className={`shrink-0 rounded-xl border px-3 py-2 text-center ${d.price === cheapestDay ? "border-accent/70" : "border-line/60"} bg-card`}>
                <div className="text-xs text-muted">{shortDate(d.date)}</div>
                <div className={`text-sm tabular-nums ${d.price === cheapestDay ? "text-accent" : ""}`}>{money(d.price, cur)}</div>
                {d.delta !== undefined && d.delta !== 0 && <div className={`text-[11px] tabular-nums ${d.delta < 0 ? "text-accent" : "text-muted"}`}>{d.delta < 0 ? "−" : "+"}{money(Math.abs(d.delta), cur)}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {outcome.primary.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-serif text-xl">{t.primaryTitle}</h3>
          {outcome.primary.map((o, i) => (
            <FlightCard key={o.id} offer={withWhy(o)} currency={cur} highlight={i === 0} />
          ))}
        </section>
      )}

      {outcome.alternatives.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-serif text-xl">{t.alternativesTitle}</h3>
          {outcome.alternatives.map((o) => (
            <FlightCard key={o.id} offer={withWhy(o)} currency={cur} />
          ))}
        </section>
      ) : outcome.primary.length > 0 && outcome.origins.length > 1 ? (
        <p className="text-sm text-muted">{t.noAlternatives}</p>
      ) : null}

      {outcome.origins.length > 1 && (
        <details className="rounded-xl border border-line/60 bg-card p-3 text-sm">
          <summary className="cursor-pointer text-muted">Aeropuertos comparados</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {[...outcome.origins.map((a) => ({ ...a, side: "Origen" })), ...outcome.destinations.map((a) => ({ ...a, side: "Destino" }))].map((a) => (
              <div key={a.side + a.iata} className="flex justify-between gap-2">
                <span>
                  <span className="text-muted">{a.side}</span> {a.iata} · {a.city}
                  {a.side === "Origen" && a.distanceKm > 0 ? <span className="text-muted"> ({a.distanceKm} km)</span> : null}
                </span>
                <span className="tabular-nums text-muted">{a.bestRealCost !== undefined ? money(a.bestRealCost, cur) : "sin datos"}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {outcome.provider.coverageNote && !outcome.provider.isDemo && <p className="text-xs text-muted">{outcome.provider.coverageNote}</p>}
      {outcome.fx.fallback && <p className="text-xs text-muted">Tipos de cambio aproximados (la fuente no respondió).</p>}
    </div>
  );
}
