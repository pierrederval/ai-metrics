import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { connectionOptions } from './connection';
import * as schema from './schema';
let coordinationConnection: ReturnType<typeof postgres> | undefined;
let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!database) {
    const { url, options } = connectionOptions('data');
    connection = postgres(url, options);
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
// awaiting the collector's nested evidence transactions. See connection.ts for the
// per-purpose ceilings, which are lower on serverless platforms.
export async function withPullRequestLock<T>(
  repositoryId: string,
  number: number,
  collect: () => Promise<T>,
): Promise<T> {
  const { url, options } = connectionOptions('coordination');
  coordinationConnection ??= postgres(url, options);
  const values = await coordinationConnection.begin(async (connection) => {
    const [lock] =
      await connection`select pg_try_advisory_xact_lock(hashtextextended(${`hydrate:${repositoryId}:${number}`}, 0)) as acquired`;
    if (!lock.acquired) throw new Error('Pull request hydration is already running; retry');
    return [await collect()];
  });
  return values[0] as T;
}
