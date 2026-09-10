import { expect, test, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/env', () => ({
  integrationEnv: () => ({ TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) }),
}));
import { sealInvitation, readInvitation } from './invitation-continuation';
test('continuation rejects expired, tampered and external redirect tokens', () => {
  const token = 'x'.repeat(43);
  const sealed = sealInvitation(token, 1000);
  expect(readInvitation(sealed, 1001)).toBe(token);
  expect(readInvitation(sealed, 601000)).toBeNull();
  expect(readInvitation(sealed, 999)).toBeNull();
  expect(readInvitation(sealed + 'x', 1001)).toBeNull();
  expect(() => sealInvitation('//evil.example')).toThrow();
});
