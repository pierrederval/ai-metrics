import { beforeEach, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { tokenHash } from './crypto';
const { cookie, select, where, redirect } = vi.hoisted(() => ({
  cookie: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../db', () => ({ db: () => ({ select }) }));
import { currentUser, hasCurrentSession } from './session';
beforeEach(() => {
  vi.resetAllMocks();
  select.mockReturnValue({
    from: () => ({
      where,
      innerJoin: () => ({ where }),
    }),
  });
});
test('missing opaque cookie is unauthenticated without a database query', async () => {
  expect(await hasCurrentSession()).toBe(false);
  expect(select).not.toHaveBeenCalled();
});
test('session check hashes the cookie and requires an unexpired row without selecting credentials', async () => {
  cookie.mockReturnValue({ value: 'opaque-secret' });
  where.mockResolvedValue([{ id: 'hash' }]);
  expect(await hasCurrentSession()).toBe(true);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
  expect(query.sql).toContain('"sessions"."expires_at" >');
  expect(query.params[0]).toBe(tokenHash('opaque-secret'));
  expect(query.params).not.toContain('opaque-secret');
  expect(Object.keys(select.mock.calls[0][0])).toEqual(['id']);
});
test('missing or expired database session is unauthenticated', async () => {
  cookie.mockReturnValue({ value: 'old-secret' });
  where.mockResolvedValue([]);
  expect(await hasCurrentSession()).toBe(false);
});

test('current identity returns only public user fields', async () => {
  cookie.mockReturnValue({ value: 'opaque-secret' });
  where.mockResolvedValue([
    {
      user: {
        id: 'user-1',
        login: 'octocat',
        displayName: 'Octo Cat',
        avatarUrl: 'https://example.test/avatar',
        credentials: 'encrypted-secret',
      },
    },
  ]);

  expect(await currentUser()).toEqual({
    id: 'user-1',
    login: 'octocat',
    displayName: 'Octo Cat',
    avatarUrl: 'https://example.test/avatar',
  });
});

test('current identity sends unauthenticated page requests to signed out', async () => {
  await expect(currentUser()).rejects.toThrow('redirect:/signed-out');
});
