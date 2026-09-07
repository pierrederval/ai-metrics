import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  deleteSession: vi.fn(),
  where: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.get, delete: mocks.remove }),
}));
vi.mock('../../../../db', () => ({
  db: () => ({ delete: mocks.deleteSession }),
}));
vi.mock('../../../../lib/env', () => ({
  env: () => ({ integration: { APP_URL: 'https://analytics.example.com/' } }),
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue({ value: 'session-token' });
  mocks.deleteSession.mockReturnValue({ where: mocks.where });
  mocks.where.mockResolvedValue(undefined);
});

it('logs out behind a proxy and redirects to the public origin', async () => {
  const response = await POST(
    new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://analytics.example.com' },
    }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://analytics.example.com/signed-out');
  expect(mocks.deleteSession).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledWith('reliability-session');
});

it.each([undefined, 'null', 'https://attacker.example.com', 'http://localhost:3000'])(
  'rejects untrusted origin %s without deleting the session',
  async (origin) => {
    const response = await POST(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: origin ? { origin } : {},
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);
