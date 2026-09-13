import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
let coordinationConnection: ReturnType<typeof postgres> | undefined;
let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    // Serverless instances each hold their own pool, so this stays small.
    // DATABASE_URL is expected to be a pooled endpoint (Neon's -pooler host),
    // which multiplexes many short-lived clients onto few server connections.
    connection = postgres(process.env.DATABASE_URL, { max: 2 });
    database = drizzle(connection, { schema });
  }
  return database;
}
export async function closeDb() {
  await coordinationConnection?.end();
  coordinationConnection = undefined;
  await connection?.end();
  database = undefined;
  connection = undefined;
}

// Separate bounded pool: lock holders never consume persistence pool slots while
// awaiting the collector's nested evidence transactions. Up to 3 coordinator + 2 data connections.
export async function withPullRequestLock<T>(
  repositoryId: string,
  number: number,
  collect: () => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  coordinationConnection ??= postgres(process.env.DATABASE_URL, { max: 3 });
  const values = await coordinationConnection.begin(async (connection) => {
    const [lock] =
      await connection`select pg_try_advisory_xact_lock(hashtextextended(${`hydrate:${repositoryId}:${number}`}, 0)) as acquired`;
    if (!lock.acquired) throw new Error('Pull request hydration is already running; retry');
    return [await collect()];
  });
  return values[0] as T;
}
