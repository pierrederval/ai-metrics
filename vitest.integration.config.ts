import 'dotenv/config';
import { defineConfig } from 'vitest/config';
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
)
  throw new Error('TEST_DATABASE_URL must name a dedicated _test database');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
export default defineConfig({
  test: { include: ['src/**/*.integration.test.ts'], fileParallelism: false, testTimeout: 30000 },
});
