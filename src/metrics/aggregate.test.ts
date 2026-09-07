import { expect, test } from 'vitest';
import { aggregate, percentage, failureBreakdown } from './aggregate';
import { demoFacts, demoPolicy } from '../demo/fixtures';
test('rates show known denominators and unknown outcomes separately', () => {
  expect(percentage([true, false, null])).toEqual({ value: 50, known: 2, unknown: 1 });
  expect(percentage([null])).toEqual({ value: null, known: 0, unknown: 1 });
  expect(aggregate([])).toMatchObject({ averageAttempts: null, medianTime: null });
});
test('failure breakdown counts executions and distinct affected PRs', () => {
  const facts = demoFacts(2);
  const report = failureBreakdown(
    [{ id: 'one', facts: { ...facts, checks: [...facts.checks, ...facts.checks] } }],
    demoPolicy,
  );
  expect(report.find((r) => r.checkName === 'playwright')).toMatchObject({
    failureCount: 2,
    affectedPrCount: 1,
    total: 3,
    failureRate: 2 / 3,
  });
});
