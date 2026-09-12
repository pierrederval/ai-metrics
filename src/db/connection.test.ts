import { expect, test } from 'vitest';
import { connectionOptions, databaseUrl } from './connection';
const url = 'postgres://user:pass@host/db';
test('every purpose needs a database and migrations prefer the direct endpoint', () => {
  expect(() => databaseUrl('data', {})).toThrow('DATABASE_URL required');
  expect(databaseUrl('migration', { DATABASE_URL: url })).toBe(url);
  expect(
    databaseUrl('migration', { DATABASE_URL: `${url}?pgbouncer=true`, DIRECT_DATABASE_URL: url }),
  ).toBe(url);
  expect(
    databaseUrl('data', { DATABASE_URL: `${url}?pgbouncer=true`, DIRECT_DATABASE_URL: url }),
  ).toBe(`${url}?pgbouncer=true`);
});
test('serverless instances hold fewer connections than a single long-lived host', () => {
  expect(connectionOptions('data', { DATABASE_URL: url }).options.max).toBe(10);
  expect(connectionOptions('coordination', { DATABASE_URL: url }).options.max).toBe(3);
  expect(connectionOptions('data', { DATABASE_URL: url, VERCEL: '1' }).options.max).toBe(3);
  expect(connectionOptions('coordination', { DATABASE_URL: url, VERCEL: '1' }).options.max).toBe(1);
});
test('prepared statements are disabled behind a transaction pooler only', () => {
  expect(connectionOptions('data', { DATABASE_URL: url }).options.prepare).toBeUndefined();
  expect(
    connectionOptions('data', { DATABASE_URL: `${url}?sslmode=require&pgbouncer=true` }).options
      .prepare,
  ).toBe(false);
  expect(
    connectionOptions('data', { DATABASE_URL: url, DATABASE_POOLED: 'true' }).options.prepare,
  ).toBe(false);
  // An explicit setting overrides the connection string, in both directions.
  expect(
    connectionOptions('data', { DATABASE_URL: `${url}?pgbouncer=true`, DATABASE_POOLED: 'false' })
      .options.prepare,
  ).toBeUndefined();
  // A migration that has no direct endpoint still runs through the pooler.
  expect(
    connectionOptions('migration', { DATABASE_URL: `${url}?pgbouncer=true` }).options.prepare,
  ).toBe(false);
  expect(
    connectionOptions('migration', {
      DATABASE_URL: `${url}?pgbouncer=true`,
      DIRECT_DATABASE_URL: url,
    }).options.prepare,
  ).toBeUndefined();
});
