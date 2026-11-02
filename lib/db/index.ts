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

// Cache the postgres client on globalThis so a warm serverless instance reuses
// the same connection pool across invocations instead of opening a new one per
// request. This matters now that reads no longer short-circuit on the probe:
// without the cache, scaling lambdas would churn (and exhaust) DB connections.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
  __pgBgClient?: ReturnType<typeof postgres>;
};

// Server-side statement timeout (ms).
//
// This is the fix for "the page never responds". The pool has no queue timeout,
// so when every connection is busy a new query waits forever. `withTimeout()`
// only stops *our* await — the abandoned query keeps holding its connection, so
// the pool stays saturated and the NEXT request hangs until the serverless
// function is killed (measured: /library and /words never returned within
// 120s). A server-side statement_timeout makes Postgres itself abort any query
// that runs too long, which releases the connection back to the pool. The
// request still degrades via withTimeout(); the pool recovers either way.
const STATEMENT_TIMEOUT_MS = isProduction ? 20000 : 30000;

export const client =
  globalForDb.__pgClient ??
  (globalForDb.__pgClient = postgres(connectionString, {
    max: isProduction ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    connection: {
      statement_timeout: STATEMENT_TIMEOUT_MS,
      // A session wedged inside a transaction is the other way a connection
      // leaks out of the pool; abort those too.
      idle_in_transaction_session_timeout: 30000,
    },
    // Required for Supabase transaction pooler (port 6543) which does not support prepared statements
    prepare: false,
    ssl: isSupabase || connectionString.includes("sslmode=require")
      ? "require"
      : connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? undefined
      : (isProduction ? { rejectUnauthorized: false } : undefined),
    onnotice: () => {},
  }));

export const db = drizzle(client, { schema });

/**
 * A second, SMALL pool reserved for deferred/background work (currently the
 * per-user SRS sync that runs in `after()`).
 *
 * That sync bulk-upserts thousands of rows and used to run on the same 5
 * connections the page render needs. Because postgres.js has no queue timeout,
 * one long sync was enough to starve every subsequent request — the page then
 * hung instead of merely being slow. Giving background work its own 2
 * connections caps the damage: at worst the sync is slow on its own, never at
 * the expense of someone signing in or opening their library.
 */
export const dbBackground = drizzle(
  globalForDb.__pgBgClient ??
    (globalForDb.__pgBgClient = postgres(connectionString, {
      max: isProduction ? 2 : 4,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
      connection: {
        // Background work is allowed to be slow, but never unbounded: an
        // abandoned statement must still give its connection back.
        statement_timeout: 60000,
        idle_in_transaction_session_timeout: 60000,
      },
      prepare: false,
      ssl: isSupabase || connectionString.includes("sslmode=require")
        ? "require"
        : connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? undefined
        : (isProduction ? { rejectUnauthorized: false } : undefined),
      onnotice: () => {},
    })),
  { schema },
);

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
      // 9s: must clear the 10s connect_timeout on a cold serverless invocation,
      // otherwise the probe loses the race and the cached false bleeds into
      // write gates (the "learning/mastered stay 0" bug).
      setTimeout(() => reject(new Error("DB probe timeout")), 9000)
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

