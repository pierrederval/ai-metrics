import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Schema work uses the direct endpoint when one exists; see src/db/connection.ts.
  dbCredentials: { url: (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)! },
});
