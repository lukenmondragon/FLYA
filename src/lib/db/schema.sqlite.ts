import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// Esquema SQLite (local / Turso). El equivalente Postgres está en schema.pg.ts.

export const searchCache = sqliteTable("search_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    route: text("route").notNull(), // "MEX-TYO"
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departMonth: text("depart_month").notNull(), // "2027-03"
    priceUsd: real("price_usd").notNull(),
    airline: text("airline"),
    tripType: text("trip_type").notNull(),
    provider: text("provider").notNull(),
    observedAt: integer("observed_at").notNull(),
  },
  (t) => [index("price_history_route_idx").on(t.route, t.departMonth, t.tripType)],
);

export const counters = sqliteTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const airports = sqliteTable("airports", {
  iata: text("iata").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  size: text("size").notNull(),
});

// Preparado para el futuro (cuentas de usuario): userId nullable.
export const savedSearches = sqliteTable("saved_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  query: text("query").notNull(), // SearchQuery en JSON
  createdAt: integer("created_at").notNull(),
});

export const priceAlerts = sqliteTable("price_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  savedSearchId: integer("saved_search_id"),
  targetPrice: real("target_price"),
  currency: text("currency"),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
