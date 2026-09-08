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
const live = {
  DATABASE_URL: 'postgres://localhost/db',
  GITHUB_APP_ID: '123',
  GITHUB_APP_SLUG: 'fieldnote-dev',
  GITHUB_PRIVATE_KEY: 'private-key',
  GITHUB_WEBHOOK_SECRET: '1234567890123456',
  GITHUB_CLIENT_ID: 'client',
  GITHUB_CLIENT_SECRET: 'secret',
  APP_URL: 'http://localhost:3000',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  INNGEST_DEV: '1',
};
test('live integration requires a safe app slug, demo does not', () => {
  expect(parseEnv(live).integration?.GITHUB_APP_SLUG).toBe('fieldnote-dev');
  expect(() => parseEnv({ ...live, GITHUB_APP_SLUG: undefined })).toThrow();
  expect(() => parseEnv({ ...live, GITHUB_APP_SLUG: '../redirect' })).toThrow();
  expect(
    parseEnv({ ...live, DEMO_MODE: 'true', GITHUB_APP_SLUG: undefined }).integration,
  ).toBeNull();
});
