import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { connectionOptions } from '../src/db/connection';
const { url, options } = connectionOptions('migration');
const connection = postgres(url, options);
try {
  await migrate(drizzle(connection), { migrationsFolder: 'drizzle' });
} finally {
  await connection.end();
}
