"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, SearchOutcome } from "@/lib/schema/api";
import type { SearchQuery } from "@/lib/schema/query";
import { describeQuery } from "@/lib/describe";
import { t } from "@/lib/i18n/es";
import { ResultsView } from "./ResultsView";

interface Turn {
  id: number;
  user: string;
  status?: string;
  progress?: { done: number; total: number };
  query?: SearchQuery;
  assumptions?: string[];
  isRefinement?: boolean;
  parser?: string;
  questions?: string[];
  outcome?: SearchOutcome;
  explanation?: { text: string; reasons: Record<string, string>; source: string };
  error?: string;
  done: boolean;
}

/** Lee la respuesta NDJSON en streaming y entrega cada evento. */
async function streamChat(body: unknown, onEvent: (e: ChatEvent) => void, signal: AbortSignal) {
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Error ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as ChatEvent);
    }
  }
}

function Thinking({ text, progress }: { text?: string; progress?: { done: number; total: number } }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        <span className="dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span>
        {text ?? t.searching}
        {progress && progress.total > 1 ? ` · ${progress.done}/${progress.total}` : ""}
      </span>
    </div>
  );
}

export function Chat({ adsEnabled, userEmail, logout }: { adsEnabled: boolean; userEmail?: string; logout?: () => Promise<void> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef(0);

  // Última consulta estructurada: se envía para refinar sin empezar de cero.
  const lastQuery = [...turns].reverse().find((x) => x.query)?.query;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const update = (id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)));

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (message.length < 2 || busy) return;
      const id = ++idRef.current;
      const history = turns.slice(-3).map((x) => x.user);
      setTurns((ts) => [...ts, { id, user: message, done: false }]);
      setInput("");
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        await streamChat(
          { message, previousQuery: lastQuery, history },
          (e) => {
            switch (e.type) {
              case "status":
                update(id, { status: e.message });
                break;
              case "progress":
                update(id, { progress: { done: e.done, total: e.total } });
                break;
              case "parsed":
                update(id, { query: e.query, assumptions: e.assumptions, isRefinement: e.isRefinement, parser: e.parser });
                break;
              case "question":
                update(id, { questions: e.questions, query: e.query });
                break;
              case "results":
                update(id, { outcome: e.outcome, status: undefined });
                break;
              case "explanation":
                update(id, { explanation: { text: e.text, reasons: e.reasons, source: e.source } });
                break;
              case "error":
                update(id, { error: e.message });
                break;
              case "done":
                update(id, { done: true, status: undefined });
                break;
            }
          },
          ac.signal,
        );
      } catch (err) {
        if (!ac.signal.aborted) update(id, { error: err instanceof Error ? err.message : String(err) });
      } finally {
        update(id, { done: true });
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, lastQuery, turns],
  );

  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
    setBusy(false);
    setInput("");
  };

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <button onClick={reset} className="font-serif text-xl text-accent" aria-label={t.newSearch}>
          {t.appName}
        </button>
        <div className="flex items-center gap-2">
          {!empty && (
            <button onClick={reset} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink">
              {t.newSearch}
            </button>
          )}
          {logout && (
            <form action={logout}>
              <button type="submit" title={userEmail} className="rounded-full px-2 py-1 text-sm text-muted hover:text-ink">
                Salir
              </button>
            </form>
          )}
        </div>
      </header>

      <main className={`flex-1 ${empty ? "flex flex-col justify-center" : ""}`}>
        {empty ? (
          <div className="pb-8 text-center">
            <h1 className="font-serif text-4xl leading-tight text-accent sm:text-5xl">¿A dónde vamos?</h1>
            <p className="mx-auto mt-3 max-w-xl text-muted">{t.tagline}</p>
          </div>
        ) : (
          <div className="space-y-8 pb-6">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-4">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-card-2 px-4 py-2.5 leading-relaxed">{turn.user}</p>
                </div>
                <div className="space-y-4">
                  {turn.query && (
                    <div className="flex flex-wrap gap-1.5" aria-label="Consulta interpretada">
                      {describeQuery(turn.query).map((c) => (
                        <span key={c} className="rounded-full border border-line/70 px-2.5 py-0.5 text-xs text-muted">
                          {c}
                        </span>
                      ))}
                      {turn.parser && <span className="px-1 text-[11px] text-muted/70">· {turn.parser === "reglas" ? "intérprete básico (sin IA)" : `IA: ${turn.parser}`}</span>}
                    </div>
                  )}
                  {turn.assumptions && turn.assumptions.length > 0 && (
                    <p className="text-sm text-muted">
                      <span className="text-ink">{t.assumptions}:</span> {turn.assumptions.join(" ")}
                    </p>
                  )}
                  {turn.questions && (
                    <div className="rounded-2xl border border-accent/40 bg-card p-4">
                      <p className="font-medium text-accent">{t.questionsTitle}</p>
                      <ul className="mt-1 list-disc pl-5">
                        {turn.questions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {turn.explanation && <p className="font-serif text-lg leading-relaxed">{turn.explanation.text}</p>}
                  {!turn.done && !turn.outcome && <Thinking text={turn.status} progress={turn.progress} />}
                  {!turn.done && turn.outcome && <Thinking text={turn.status ?? "Redactando la recomendación…"} />}
                  {turn.outcome && <ResultsView outcome={turn.outcome} reasons={turn.explanation?.reasons ?? {}} />}
                  {turn.outcome && turn.outcome.primary.length === 0 && turn.outcome.alternatives.length === 0 && (
                    <p className="rounded-2xl border border-line/60 bg-card p-4 text-sm">No hay resultados que mostrar. Prueba a cambiar fechas o a permitir escalas.</p>
                  )}
                  {turn.error && (
                    <p role="alert" className="rounded-2xl border border-danger/60 bg-danger/5 p-4 text-sm text-danger">
                      {turn.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <div className="sticky bottom-0 bg-gradient-to-t from-bg via-bg to-bg/0 pb-4 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 rounded-3xl border border-line bg-card p-2 pl-4 shadow-lg shadow-black/20 focus-within:border-accent/60"
        >
          <label htmlFor="q" className="sr-only">
            Tu búsqueda
          </label>
          <textarea
            id="q"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={empty ? 2 : 1}
            maxLength={600}
            placeholder={lastQuery ? t.refinePlaceholder : t.inputPlaceholder}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 leading-relaxed text-ink placeholder:text-muted/80 focus:outline-none focus-visible:outline-none"
          />
          <button type="submit" disabled={busy || input.trim().length < 2} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition disabled:opacity-40">
            {busy ? "…" : t.send}
          </button>
        </form>
        {empty && (
          <div className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">{t.examplesTitle}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {t.examples.map((ex) => (
                <button key={ex} onClick={() => void send(ex)} className="rounded-2xl border border-line/70 bg-card/60 p-3 text-left text-sm text-muted transition hover:border-accent/60 hover:text-ink">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {adsEnabled && !empty && <AdSlot />}
      </div>
    </div>
  );
}

/** Espacio publicitario discreto: fuera de los resultados y claramente etiquetado. Desactivado por defecto. */
function AdSlot() {
  return (
    <aside aria-label={t.adLabel} className="mt-3 rounded-xl border border-dashed border-line p-2 text-center text-[11px] text-muted">
      {t.adLabel} · espacio reservado
    </aside>
  );
}
