import type { Options } from 'postgres';

// Serverless platforms run many short-lived instances, each opening its own
// pool, so a per-instance ceiling sized for one long-lived container multiplies
// into far more PostgreSQL clients than a single host would ever hold. Keep the
// ceiling small there and let the platform's own pooler do the multiplexing.
export type PoolPurpose = 'data' | 'coordination' | 'migration';
const ceilings: Record<PoolPurpose, { hosted: number; serverless: number }> = {
  data: { hosted: 10, serverless: 3 },
  coordination: { hosted: 3, serverless: 1 },
  migration: { hosted: 1, serverless: 1 },
};

// Migrations run DDL and must not go through a transaction pooler when a direct
// endpoint exists: pooled endpoints can move a session between server
// connections, and some hosts refuse advisory locks and DDL there entirely.
export function databaseUrl(
  purpose: PoolPurpose,
  input: Record<string, string | undefined> = process.env,
) {
  const url =
    purpose === 'migration'
      ? (input.DIRECT_DATABASE_URL ?? input.DATABASE_URL)
      : input.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  return url;
}

// Transaction pooling hands every transaction a different server connection, so
// a named prepared statement is never found again on the connection that runs
// the next query. postgres-js prepares by default; behind a pooler it must not.
export function connectionOptions(
  purpose: PoolPurpose,
  input: Record<string, string | undefined> = process.env,
): { url: string; options: Options<Record<string, never>> } {
  const url = databaseUrl(purpose, input);
  const serverless = input.VERCEL === '1';
  const pooled = input.DATABASE_POOLED
    ? input.DATABASE_POOLED === 'true'
    : /[?&]pgbouncer=true\b/i.test(url);
  return {
    url,
    options: {
      max: ceilings[purpose][serverless ? 'serverless' : 'hosted'],
      ...(pooled ? { prepare: false } : {}),
    },
  };
}
