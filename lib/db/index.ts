import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

export const hasDbConfig = Boolean(rawConnectionString);

const connectionString =
  rawConnectionString || "postgresql://lingo:lingo_local_dev@localhost:5432/lingo";

const isSupabase =
  connectionString.includes("supabase.com") ||
  connectionString.includes("supabase.co") ||
  connectionString.includes("pooler");
const isProduction = process.env.NODE_ENV === "production";

export const client = postgres(connectionString, {
  max: isProduction ? 5 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  // Required for Supabase transaction pooler (port 6543) which does not support prepared statements
  prepare: false,
  ssl: isSupabase || connectionString.includes("sslmode=require")
    ? "require"
    : connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? undefined
    : (isProduction ? { rejectUnauthorized: false } : undefined),
  onnotice: () => {},
});

export const db = drizzle(client, { schema });

// Cached probe to quickly skip DB queries if database is unreachable (e.g. local dev without Postgres)
let dbStatusCached: boolean | null = null;
let dbStatusCheckedAt = 0;

export async function isDbAvailable(): Promise<boolean> {
  // If no DB URL is provided in environment, skip immediately to prevent hanging
  if (!hasDbConfig) {
    return false;
  }

  const now = Date.now();
  // Cache check for 3 seconds if offline, 60 seconds if online
  if (dbStatusCached !== null) {
    const ttl = dbStatusCached ? 60000 : 3000;
    if (now - dbStatusCheckedAt < ttl) return dbStatusCached;
  }

  try {
    const checkPromise = client`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB probe timeout")), 4000)
    );
    await Promise.race([checkPromise, timeoutPromise]);
    dbStatusCached = true;
  } catch (err) {
    // Keep previously active status if it was true and this was just a probe lag
    if (dbStatusCached !== true) {
      dbStatusCached = false;
    }
  }
  dbStatusCheckedAt = now;
  return dbStatusCached;
}

