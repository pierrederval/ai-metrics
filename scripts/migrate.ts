import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
// Migrations need a direct connection. Neon's pooled endpoint runs PgBouncer in
// transaction mode, which discards the session state DDL depends on, and fails
// in ways that never name pooling as the cause. Hosts that expose a single
// connection string (Railway, local Postgres) fall back to it unchanged.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const connection = postgres(url, { max: 1 });
try {
  await migrate(drizzle(connection), { migrationsFolder: 'drizzle' });
} finally {
  await connection.end();
}
