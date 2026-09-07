import { expect, test } from 'vitest';
import { encrypt, decrypt } from './crypto';
test('credentials roundtrip and tampering is rejected', () => {
  const key = 'a'.repeat(64),
    encoded = encrypt('secret-token', key);
  expect(encoded).not.toContain('secret-token');
  expect(decrypt(encoded, key)).toBe('secret-token');
  expect(() => decrypt(encoded, 'b'.repeat(64))).toThrow();
});
