import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const connection=postgres(process.env.DATABASE_URL,{max:1});
try {await migrate(drizzle(connection),{migrationsFolder:'drizzle'});} finally {await connection.end();}
