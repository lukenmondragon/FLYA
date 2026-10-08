import { pgTable, text, bigint, doublePrecision, serial, integer, index } from "drizzle-orm/pg-core";

// Esquema Postgres (Neon / Supabase) equivalente a schema.sqlite.ts.

export const searchCache = pgTable("search_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    route: text("route").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departMonth: text("depart_month").notNull(),
    priceUsd: doublePrecision("price_usd").notNull(),
    airline: text("airline"),
    tripType: text("trip_type").notNull(),
    provider: text("provider").notNull(),
    observedAt: bigint("observed_at", { mode: "number" }).notNull(),
  },
  (t) => [index("price_history_route_idx").on(t.route, t.departMonth, t.tripType)],
);

export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const airports = pgTable("airports", {
  iata: text("iata").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  size: text("size").notNull(),
});

export const savedSearches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  query: text("query").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  savedSearchId: integer("saved_search_id"),
  targetPrice: doublePrecision("target_price"),
  currency: text("currency"),
  active: integer("active").notNull().default(1),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
