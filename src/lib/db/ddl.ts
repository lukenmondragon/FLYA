/** DDL idempotente. Se ejecuta al primer uso para no depender de un paso de migración en el MVP. */
export function ddl(dialect: "sqlite" | "pg"): string[] {
  const id = dialect === "pg" ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const big = dialect === "pg" ? "BIGINT" : "INTEGER";
  const real = dialect === "pg" ? "DOUBLE PRECISION" : "REAL";
  return [
    `CREATE TABLE IF NOT EXISTS search_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at ${big} NOT NULL, expires_at ${big} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS price_history (id ${id}, route TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL, depart_month TEXT NOT NULL, price_usd ${real} NOT NULL, airline TEXT, trip_type TEXT NOT NULL, provider TEXT NOT NULL, observed_at ${big} NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS price_history_route_idx ON price_history (route, depart_month, trip_type)`,
    `CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at ${big} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS airports (iata TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT, country TEXT NOT NULL, lat ${real} NOT NULL, lon ${real} NOT NULL, size TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS saved_searches (id ${id}, user_id TEXT, query TEXT NOT NULL, created_at ${big} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS price_alerts (id ${id}, user_id TEXT, saved_search_id INTEGER, target_price ${real}, currency TEXT, active INTEGER NOT NULL DEFAULT 1, created_at ${big} NOT NULL)`,
  ];
}
