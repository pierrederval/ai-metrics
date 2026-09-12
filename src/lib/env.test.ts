import { expect, test } from 'vitest';
import { parseEnv, platformAppUrl } from './env';
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

test('a deployment names itself when APP_URL is absent, and never overrides it', () => {
  const vercel = {
    ...live,
    APP_URL: undefined,
    VERCEL: '1',
    VERCEL_URL: 'fieldnote-abc123.vercel.app',
  };
  // A preview keeps the stable branch host, so one registered OAuth callback keeps working.
  expect(
    parseEnv({
      ...vercel,
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'fieldnote-git-topic.vercel.app',
    }).integration?.APP_URL,
  ).toBe('https://fieldnote-git-topic.vercel.app');
  expect(
    parseEnv({
      ...vercel,
      VERCEL_ENV: 'production',
      VERCEL_BRANCH_URL: 'fieldnote-git-main.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'fieldnote.example',
    }).integration?.APP_URL,
  ).toBe('https://fieldnote.example');
  expect(parseEnv({ ...vercel, VERCEL_ENV: 'preview' }).integration?.APP_URL).toBe(
    'https://fieldnote-abc123.vercel.app',
  );
  expect(parseEnv({ ...vercel, APP_URL: 'https://fieldnote.example' }).integration?.APP_URL).toBe(
    'https://fieldnote.example',
  );
  expect(platformAppUrl({})).toBeUndefined();
  expect(() => parseEnv({ ...live, APP_URL: undefined })).toThrow();
});
test('a derived deployment URL satisfies the production HTTPS requirement', () => {
  expect(() =>
    parseEnv({
      ...live,
      APP_URL: undefined,
      NODE_ENV: 'production',
      INNGEST_DEV: '0',
      INNGEST_EVENT_KEY: 'event',
      INNGEST_SIGNING_KEY: 'signing',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'fieldnote.example',
    }),
  ).not.toThrow();
});
