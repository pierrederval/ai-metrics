import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    connection = postgres(process.env.DATABASE_URL, { max: 10 });
    database = drizzle(connection, { schema });
  }
  return database;
}
export async function closeDb() {
  await connection?.end();
  database = undefined;
  connection = undefined;
}
