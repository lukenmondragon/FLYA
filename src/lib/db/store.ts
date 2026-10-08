import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { env } from "../env";
import { log } from "../log";
import { ddl } from "./ddl";
import * as S from "./schema.sqlite";
import * as P from "./schema.pg";

export interface PriceObservation {
  route: string;
  origin: string;
  destination: string;
  departMonth: string;
  priceUsd: number;
  airline?: string;
  tripType: "roundtrip" | "oneway";
  provider: string;
}

/** Capa de persistencia mínima. Implementaciones: memoria, SQLite/libSQL (Drizzle) y Postgres (Drizzle). */
export interface Store {
  readonly kind: string;
  getCache<T>(key: string): Promise<{ value: T; createdAt: number } | null>;
  setCache(key: string, value: unknown, ttlMinutes: number): Promise<void>;
  addPrices(rows: PriceObservation[]): Promise<void>;
  /** Precios observados (USD) para una ruta y mes en los últimos `days` días. */
  routePrices(route: string, departMonth: string, tripType: string, days?: number): Promise<number[]>;
  /** Incrementa un contador con caducidad y devuelve el valor nuevo. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
}

class MemoryStore implements Store {
  readonly kind = "memory";
  private cache = new Map<string, { value: string; createdAt: number; expiresAt: number }>();
  private prices: (PriceObservation & { observedAt: number })[] = [];
  private counters = new Map<string, { value: number; expiresAt: number }>();

  async getCache<T>(key: string) {
    const e = this.cache.get(key);
    if (!e || e.expiresAt < Date.now()) return null;
    return { value: JSON.parse(e.value) as T, createdAt: e.createdAt };
  }
  async setCache(key: string, value: unknown, ttlMinutes: number) {
    const now = Date.now();
    this.cache.set(key, { value: JSON.stringify(value), createdAt: now, expiresAt: now + ttlMinutes * 60_000 });
  }
  async addPrices(rows: PriceObservation[]) {
    const now = Date.now();
    this.prices.push(...rows.map((r) => ({ ...r, observedAt: now })));
    if (this.prices.length > 50_000) this.prices.splice(0, this.prices.length - 50_000);
  }
  async routePrices(route: string, departMonth: string, tripType: string, days = 60) {
    const since = Date.now() - days * 86_400_000;
    return this.prices.filter((p) => p.route === route && p.departMonth === departMonth && p.tripType === tripType && p.observedAt > since).map((p) => p.priceUsd);
  }
  async incr(key: string, by: number, ttlSeconds: number) {
    const now = Date.now();
    const e = this.counters.get(key);
    const value = (e && e.expiresAt > now ? e.value : 0) + by;
    this.counters.set(key, { value, expiresAt: e && e.expiresAt > now ? e.expiresAt : now + ttlSeconds * 1000 });
    return value;
  }
}

type SqliteDb = ReturnType<typeof import("drizzle-orm/libsql").drizzle>;
type PgDb = ReturnType<typeof import("drizzle-orm/postgres-js").drizzle>;

class SqliteStore implements Store {
  readonly kind = "sqlite";
  constructor(private db: SqliteDb) {}
  async getCache<T>(key: string) {
    const rows = await this.db.select().from(S.searchCache).where(and(eq(S.searchCache.key, key), gt(S.searchCache.expiresAt, Date.now()))).limit(1);
    const r = rows[0];
    return r ? { value: JSON.parse(r.value) as T, createdAt: r.createdAt } : null;
  }
  async setCache(key: string, value: unknown, ttlMinutes: number) {
    const now = Date.now();
    const row = { key, value: JSON.stringify(value), createdAt: now, expiresAt: now + ttlMinutes * 60_000 };
    await this.db.insert(S.searchCache).values(row).onConflictDoUpdate({ target: S.searchCache.key, set: row });
    if (Math.random() < 0.02) await this.db.delete(S.searchCache).where(lt(S.searchCache.expiresAt, now));
  }
  async addPrices(rows: PriceObservation[]) {
    if (!rows.length) return;
    const now = Date.now();
    await this.db.insert(S.priceHistory).values(rows.map((r) => ({ ...r, airline: r.airline ?? null, observedAt: now })));
  }
  async routePrices(route: string, departMonth: string, tripType: string, days = 60) {
    const since = Date.now() - days * 86_400_000;
    const rows = await this.db
      .select({ p: S.priceHistory.priceUsd })
      .from(S.priceHistory)
      .where(and(eq(S.priceHistory.route, route), eq(S.priceHistory.departMonth, departMonth), eq(S.priceHistory.tripType, tripType), gt(S.priceHistory.observedAt, since)))
      .limit(2000);
    return rows.map((r) => r.p);
  }
  async incr(key: string, by: number, ttlSeconds: number) {
    const now = Date.now();
    const rows = await this.db
      .insert(S.counters)
      .values({ key, value: by, expiresAt: now + ttlSeconds * 1000 })
      .onConflictDoUpdate({
        target: S.counters.key,
        set: {
          value: sql`CASE WHEN ${S.counters.expiresAt} < ${now} THEN ${by} ELSE ${S.counters.value} + ${by} END`,
          expiresAt: sql`CASE WHEN ${S.counters.expiresAt} < ${now} THEN ${now + ttlSeconds * 1000} ELSE ${S.counters.expiresAt} END`,
        },
      })
      .returning({ value: S.counters.value });
    return rows[0]?.value ?? by;
  }
}

class PgStore implements Store {
  readonly kind = "postgres";
  constructor(private db: PgDb) {}
  async getCache<T>(key: string) {
    const rows = await this.db.select().from(P.searchCache).where(and(eq(P.searchCache.key, key), gt(P.searchCache.expiresAt, Date.now()))).limit(1);
    const r = rows[0];
    return r ? { value: JSON.parse(r.value) as T, createdAt: r.createdAt } : null;
  }
  async setCache(key: string, value: unknown, ttlMinutes: number) {
    const now = Date.now();
    const row = { key, value: JSON.stringify(value), createdAt: now, expiresAt: now + ttlMinutes * 60_000 };
    await this.db.insert(P.searchCache).values(row).onConflictDoUpdate({ target: P.searchCache.key, set: row });
    if (Math.random() < 0.02) await this.db.delete(P.searchCache).where(lt(P.searchCache.expiresAt, now));
  }
  async addPrices(rows: PriceObservation[]) {
    if (!rows.length) return;
    const now = Date.now();
    await this.db.insert(P.priceHistory).values(rows.map((r) => ({ ...r, airline: r.airline ?? null, observedAt: now })));
  }
  async routePrices(route: string, departMonth: string, tripType: string, days = 60) {
    const since = Date.now() - days * 86_400_000;
    const rows = await this.db
      .select({ p: P.priceHistory.priceUsd })
      .from(P.priceHistory)
      .where(and(eq(P.priceHistory.route, route), eq(P.priceHistory.departMonth, departMonth), eq(P.priceHistory.tripType, tripType), gt(P.priceHistory.observedAt, since)))
      .limit(2000);
    return rows.map((r) => r.p);
  }
  async incr(key: string, by: number, ttlSeconds: number) {
    const now = Date.now();
    const rows = await this.db
      .insert(P.counters)
      .values({ key, value: by, expiresAt: now + ttlSeconds * 1000 })
      .onConflictDoUpdate({
        target: P.counters.key,
        set: {
          value: sql`CASE WHEN ${P.counters.expiresAt} < ${now} THEN ${by} ELSE ${P.counters.value} + ${by} END`,
          expiresAt: sql`CASE WHEN ${P.counters.expiresAt} < ${now} THEN ${now + ttlSeconds * 1000} ELSE ${P.counters.expiresAt} END`,
        },
      })
      .returning({ value: P.counters.value });
    return rows[0]?.value ?? by;
  }
}

let storePromise: Promise<Store> | undefined;

async function createStore(): Promise<Store> {
  const url = env().DATABASE_URL;
  try {
    if (url === "memory:") return new MemoryStore();
    if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
      const { default: postgres } = await import("postgres");
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const client = postgres(url, { max: 3, prepare: false });
      for (const stmt of ddl("pg")) await client.unsafe(stmt);
      return new PgStore(drizzle(client));
    }
    // SQLite local ("file:...") o libSQL/Turso ("libsql://...").
    if (url.startsWith("file:")) {
      const file = url.slice(5);
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    }
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
    for (const stmt of ddl("sqlite")) await client.execute(stmt);
    return new SqliteStore(drizzle(client));
  } catch (e) {
    // En Vercel sin base de datos configurada, el sistema de archivos es de solo lectura: seguimos en memoria.
    log.warn("No se pudo abrir la base de datos; usando memoria", { url: url.replace(/\/\/.*@/, "//***@"), error: String(e) });
    return new MemoryStore();
  }
}

export function getStore(): Promise<Store> {
  storePromise ??= createStore();
  return storePromise;
}
