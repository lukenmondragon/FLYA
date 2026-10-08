/** Ejecuta tareas con un límite de concurrencia, conservando el orden de los resultados. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Reintenta con backoff exponencial y jitter. Solo reintenta errores transitorios (red, 429, 5xx). */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; isRetryable?: (e: unknown) => boolean } = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  const isRetryable =
    opts.isRetryable ??
    ((e: unknown) => {
      if (e instanceof HttpError) return e.status === 429 || e.status >= 500;
      return e instanceof TypeError || (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"));
    });
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      const delay = baseMs * 2 ** attempt + Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
