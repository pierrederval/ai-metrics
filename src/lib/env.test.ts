import { expect, test } from 'vitest';
import { parseEnv } from './env';
test('demo is explicit, requires DB, and cannot run in production', () => {
  expect(() => parseEnv({ DEMO_MODE: 'true' })).toThrow();
  expect(() =>
    parseEnv({
      DATABASE_URL: 'postgres://localhost/db',
      DEMO_MODE: 'true',
      NODE_ENV: 'production',
    }),
  ).toThrow('Demo');
  expect(
    parseEnv({ DATABASE_URL: 'postgres://localhost/db', DEMO_MODE: 'true' }).integration,
  ).toBeNull();
  expect(() => parseEnv({ DATABASE_URL: 'postgres://localhost/db' })).toThrow();
});
