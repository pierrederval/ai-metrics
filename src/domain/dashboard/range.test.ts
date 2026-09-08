import { expect, test } from 'vitest';
import { previousRange, resolveRange } from './range';
const now = new Date('2026-09-08T12:00:00Z');
test('rolling days include today in UTC and previous period is adjacent and equal', () => {
  const range = resolveRange({ days: 30 }, now);
  expect(range).toEqual({
    start: '2026-08-10T00:00:00.000Z',
    endExclusive: '2026-09-09T00:00:00.000Z',
    days: 30,
  });
  expect(previousRange(range)).toEqual({
    start: '2026-07-11T00:00:00.000Z',
    endExclusive: '2026-08-10T00:00:00.000Z',
    days: 30,
  });
  expect(resolveRange({}, now).days).toBe(7);
});
test('custom dates are inclusive and retain leap day', () => {
  expect(resolveRange({ from: '2024-02-28', to: '2024-03-01' }, now)).toEqual({
    start: '2024-02-28T00:00:00.000Z',
    endExclusive: '2024-03-02T00:00:00.000Z',
    days: 3,
  });
});
test.each([
  { from: '2026-02-29', to: '2026-03-01' },
  { from: '2026-09-01' },
  { from: '2026-09-03', to: '2026-09-02' },
  { days: 0 },
  { days: 8 },
  { from: '2026-09-08', to: '2026-09-09' },
  { from: '2026-9-1', to: '2026-09-02' },
])('rejects invalid range %j', (input) => {
  expect(() => resolveRange(input, now)).toThrow();
});
