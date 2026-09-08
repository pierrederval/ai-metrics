import { expect, test } from 'vitest';
import { canonicalPathname } from './navigation-path';

test.each([
  ['/repos/repository:123', '/repos/repository%3A123'],
  ['/repos/repository%3a123', '/repos/repository%3A123'],
  ['/repos/repository%3A123', '/repos/repository%3A123'],
  ['/prs/a%2Fb', '/prs/a%2Fb'],
  ['/repos/a%253Ab', '/repos/a%253Ab'],
  ['/repos/100%', '/repos/100%25'],
  ['/dashboard', '/dashboard'],
])('canonicalizes %s without changing path segment identity', (input, expected) => {
  expect(canonicalPathname(input)).toBe(expected);
});
