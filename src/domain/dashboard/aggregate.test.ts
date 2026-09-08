import { expect, test } from 'vitest';
import { aggregateDays, aggregatePeriod, comparePeriods } from './aggregate';
import { resolveRange } from './range';
import type { PrEvidence, WorkflowAttempt } from './types';
const now = new Date('2026-09-08T12:00:00Z');
const range = resolveRange({ days: 7 }, now);
const attempt = (overrides: Partial<WorkflowAttempt> = {}): WorkflowAttempt => ({
  repositoryId: 'repo',
  runId: 'run',
  attempt: 1,
  headSha: 'head',
  status: 'completed',
  conclusion: 'success',
  startedAt: '2026-09-03T01:00:00Z',
  completedAt: '2026-09-03T02:00:00Z',
  ...overrides,
});
const pr = (overrides: Partial<PrEvidence> = {}): PrEvidence => ({
  id: 'pr',
  repositoryId: 'repo',
  openedAt: '2025-01-01T00:00:00Z',
  mergedAt: '2026-09-03T12:00:00Z',
  mergeHeadSha: 'head',
  reviewExpected: false,
  ciExpected: true,
  chronologyComplete: true,
  reviewsComplete: true,
  ciComplete: true,
  reviews: [],
  attempts: [attempt()],
  ...overrides,
});
test.each([7, 30, 90])('retains %i empty positions and gaps', (days) => {
  const rows = aggregateDays([], resolveRange({ days }, now));
  expect(rows).toHaveLength(days);
  expect(rows.every((d) => d.firstPass.value === null && d.mergedValue === null)).toBe(true);
});
test('weights raw PR and CI counts across repositories, deduplicates linkages, preserves totals', () => {
  const input = [
    pr(),
    ...Array.from({ length: 9 }, (_, i) =>
      pr({
        id: `failed-${i}`,
        repositoryId: 'other',
        attempts: [attempt({ repositoryId: 'other', runId: `run-${i}`, conclusion: 'failure' })],
      }),
    ),
  ];
  const result = aggregatePeriod([...input, input[0]], range);
  expect(result.totals.merged).toBe(10);
  expect(result.totals.firstPass).toMatchObject({ numerator: 1, denominator: 10, value: 10 });
  expect(result.totals.ciSuccess).toMatchObject({ numerator: 1, denominator: 10, value: 10 });
  expect(result.days.reduce((n, d) => n + d.firstPass.denominator, 0)).toBe(10);
  const linked = aggregatePeriod([pr(), pr({ id: 'linked' })], range);
  expect(linked.totals.merged).toBe(2);
  expect(linked.totals.ciSuccess.denominator).toBe(1);
});
test('keeps frozen merge classification separate from latest operational rerun', () => {
  const evidence = pr({
    attempts: [
      attempt(),
      attempt({
        attempt: 2,
        status: 'in_progress',
        conclusion: null,
        startedAt: '2026-09-04T01:00:00Z',
        completedAt: null,
      }),
    ],
  });
  const result = aggregatePeriod([evidence], range);
  expect(result.totals.firstPass.value).toBe(100);
  expect(result.totals.ci.pending).toBe(1);
  expect(result.totals.ciSuccess.value).toBeNull();
});
test('end is exclusive and reruns move to latest terminal date', () => {
  const result = aggregatePeriod(
    [
      pr({
        mergedAt: range.endExclusive,
        attempts: [
          attempt({ conclusion: 'failure' }),
          attempt({
            attempt: 2,
            startedAt: '2026-09-05T01:00:00Z',
            completedAt: '2026-09-05T02:00:00Z',
          }),
          attempt({
            attempt: 3,
            startedAt: range.endExclusive,
            completedAt: '2026-09-09T01:00:00Z',
            conclusion: 'failure',
          }),
        ],
      }),
    ],
    range,
  );
  expect(result.totals.merged).toBe(0);
  expect(result.days[3].ci.recovered).toBe(1);
  expect(result.days[1].ci.failed).toBe(0);
});
test('observation is a date fallback only on same UTC start day; uncertainty survives', () => {
  const result = aggregatePeriod(
    [
      pr({
        attempts: [attempt({ completedAt: null, terminalObservedAt: '2026-09-04T02:00:00Z' })],
      }),
    ],
    range,
  );
  expect(result.totals.ciSuccess.value).toBeNull();
  expect(result.undatedCi['first-pass']).toBe(1);
  expect(result.coverageReasons).toContain('unknown-workflow-date');
  const sameDay = aggregatePeriod(
    [
      pr({
        attempts: [attempt({ completedAt: null, terminalObservedAt: '2026-09-03T03:00:00Z' })],
      }),
    ],
    range,
  );
  expect(sameDay.days[1].ci['first-pass']).toBe(1);
});
test.each(['cancelled', 'skipped', 'neutral'])('%s is excluded, never failure', (conclusion) => {
  const result = aggregatePeriod([pr({ attempts: [attempt({ conclusion })] })], range);
  expect(result.totals.ciSuccess).toMatchObject({ denominator: 0, value: null, excluded: 1 });
  expect(result.totals.ci.failed).toBe(0);
});
test('unknown and ineligible merged PRs remain separate from denominator', () => {
  const result = aggregatePeriod(
    [pr({ ciComplete: false }), pr({ id: 'none', ciExpected: false, attempts: [] })],
    range,
  );
  expect(result.totals.firstPass).toMatchObject({ denominator: 0, excluded: 2, value: null });
  expect(result.totals.prOutcomes).toMatchObject({ unknown: 1, ineligible: 1 });
});
test('comparisons use percentage points and suppress missing or unequal coverage', () => {
  const current = aggregatePeriod([pr()], range);
  const prior = aggregatePeriod([pr({ attempts: [attempt({ conclusion: 'failure' })] })], range);
  expect(comparePeriods(current.totals, prior.totals, true)).toEqual({
    mergedPercent: 0,
    firstPassPoints: 100,
    ciSuccessPoints: 100,
  });
  expect(comparePeriods(current.totals, prior.totals, false)).toEqual({
    mergedPercent: null,
    firstPassPoints: null,
    ciSuccessPoints: null,
  });
  expect(
    comparePeriods(current.totals, aggregatePeriod([], range).totals, true).mergedPercent,
  ).toBeNull();
});

test('a pending rerun with earlier completion outside range is still counted as activity', () => {
  const result = aggregatePeriod(
    [
      pr({
        attempts: [
          attempt({ startedAt: '2026-08-01T01:00:00Z', completedAt: '2026-08-01T02:00:00Z' }),
          attempt({
            attempt: 2,
            status: 'in_progress',
            conclusion: null,
            startedAt: '2026-09-04T01:00:00Z',
            completedAt: null,
          }),
        ],
      }),
    ],
    range,
  );
  expect(result.days[2].ci.pending).toBe(1);
  expect(result.totals.ciSuccess.denominator).toBe(0);
});

test('malformed attempt chronology stays unknown instead of disappearing during date filtering', () => {
  const result = aggregatePeriod([pr({ attempts: [attempt({ startedAt: 'invalid' })] })], range);
  expect(result.totals.ci.unknown).toBe(1);
  expect(result.totals.ciSuccess.value).toBeNull();
  expect(result.coverageReasons).toContain('evidence-incomplete');
});

test('terminal observation after the cutoff remains an excluded undated unknown', () => {
  const result = aggregatePeriod(
    [
      pr({
        attempts: [attempt({ completedAt: null, terminalObservedAt: '2026-09-10T01:00:00Z' })],
      }),
    ],
    range,
  );
  expect(result.totals.ciSuccess.denominator).toBe(0);
  expect(result.undatedCi.unknown).toBe(1);
  expect(result.coverageReasons).toContain('unknown-workflow-date');
});
