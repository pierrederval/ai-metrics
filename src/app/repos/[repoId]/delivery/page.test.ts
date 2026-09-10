import { beforeEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RangeSearch } from '../../../../components/dashboard/range-query';

const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  dashboard: vi.fn(),
  prRows: vi.fn(),
}));
vi.mock('../../../../auth/access', () => ({ requireTrackedRepository: deps.authorize }));
vi.mock('../../../../db/queries/basic-dashboard', () => ({ loadBasicDashboard: deps.dashboard }));
vi.mock('../../../../db/queries/dashboard', () => ({ prRows: deps.prRows }));
// BasicDashboard renders DateRange, a client component that calls
// usePathname() — outside an actual Next.js request context that throws, so
// this mirrors the same mock src/app/dashboard/page.test.ts uses for the
// other BasicDashboard caller.
vi.mock('next/navigation', () => ({
  usePathname: () => '/repos/repo/delivery',
  useRouter: () => ({ push: vi.fn() }),
}));

import Delivery from './page';

const call = (search: RangeSearch = {}) =>
  Delivery({
    params: Promise.resolve({ repoId: 'repo' }),
    searchParams: Promise.resolve(search),
  });

const dashboardData = {
  range: { start: '2026-09-01T00:00:00.000Z', endExclusive: '2026-09-08T00:00:00.000Z', days: 7 },
  collectionBounds: { from: null, to: null },
  coverage: 'complete',
  coverageReasons: [],
  previousCoverageReasons: [],
  visiblePrCount: 3,
  totals: {
    merged: 2,
    firstPass: { value: 50, numerator: 1, denominator: 2, excluded: 0 },
    ciSuccess: { value: 80, numerator: 4, denominator: 5, excluded: 0 },
    ciRecovered: { value: 20, numerator: 1 },
    prOutcomes: { ineligible: 0, unknown: 0 },
    ci: { pending: 0, cancelled: 0, skipped: 0, neutral: 0, unknown: 0 },
  },
  comparisons: { mergedPercent: null, firstPassPoints: null, ciSuccessPoints: null },
  undatedCi: {},
  days: [],
};

const rows = [
  {
    pr: {
      id: 'pr-codex',
      githubPrNumber: 21,
      title: 'Add checkout validation',
      state: 'open',
      mergedAt: null,
      sourceUpdatedAt: new Date('2026-09-08T10:00:00.000Z'),
      agentProvider: 'codex',
    },
    metrics: {
      projection: {
        firstPassGreen: true,
        eventuallyGreen: true,
        attemptsToGreen: 1,
        ciAttemptCount: 1,
        cleanGreen: true,
        harnessChangedAfterFailure: false,
        timeToFirstGreenSeconds: 300,
      },
      firstPassGreen: true,
      attemptsToGreen: 1,
      ciAttemptCount: 1,
      cleanGreen: true,
      harnessChangedAfterFailure: false,
      timeToFirstGreenSeconds: 300,
    },
  },
  {
    pr: {
      id: 'pr-unattributed',
      githubPrNumber: 18,
      title: 'Update checkout harness',
      state: 'closed',
      mergedAt: new Date('2026-09-07T00:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-09-07T00:00:00.000Z'),
      agentProvider: 'unknown',
    },
    metrics: {
      projection: {
        firstPassGreen: true,
        eventuallyGreen: true,
        attemptsToGreen: 1,
        ciAttemptCount: 1,
        cleanGreen: true,
        harnessChangedAfterFailure: false,
        timeToFirstGreenSeconds: 200,
      },
      firstPassGreen: true,
      attemptsToGreen: 1,
      ciAttemptCount: 1,
      cleanGreen: true,
      harnessChangedAfterFailure: false,
      timeToFirstGreenSeconds: 200,
    },
  },
  {
    pr: {
      id: 'pr-retired-agent',
      githubPrNumber: 3,
      title: 'Old agent id',
      state: 'closed',
      mergedAt: new Date('2026-09-06T00:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-09-06T00:00:00.000Z'),
      agentProvider: 'retired-agent',
    },
    metrics: {
      projection: {
        firstPassGreen: false,
        eventuallyGreen: false,
        attemptsToGreen: null,
        ciAttemptCount: 2,
        cleanGreen: false,
        harnessChangedAfterFailure: null,
        timeToFirstGreenSeconds: null,
      },
      firstPassGreen: false,
      attemptsToGreen: null,
      ciAttemptCount: 2,
      cleanGreen: false,
      harnessChangedAfterFailure: null,
      timeToFirstGreenSeconds: null,
    },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue({ id: 'repo', owner: 'owner', name: 'repo', canAdmin: true });
  deps.dashboard.mockResolvedValue(dashboardData);
  deps.prRows.mockResolvedValue(rows);
});

test('renders the pull-request table at full width with an Agent column', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('<th>Agent</th>');
  expect(html).toContain('Add checkout validation');
});

test('labels agents using the catalogue, never renders "Human", and falls back to the raw id', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('Codex');
  expect(html).toContain('Unattributed');
  expect(html).not.toContain('>Human<');
  // retired-agent has no catalogue entry: fall back to the raw id rather than throwing.
  expect(html).toContain('retired-agent');
});

test('defaults to the basic-outcomes projection with the recent-activity columns', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('Source activity (UTC)');
  expect(html).toContain('View PR');
  expect(html).not.toContain('Harness mutation');
  // MetricCards (the gate-policy rollup) is a toggle, not a separate section by default.
  expect(html).not.toContain('Average attempts to green');
});

test('the gate-policy projection is a toggle on the same table, not a separate list', async () => {
  const html = renderToStaticMarkup(await call({ projection: 'gate-policy' }));
  expect(html).toContain('Harness mutation');
  expect(html).toContain('Clean green');
  expect(html).not.toContain('Source activity (UTC)');
  // MetricCards, the gate-policy rollup, joins the toggle.
  expect(html).toContain('Average attempts to green');
});

test('loads only the dashboard aggregation and the pull-request records', async () => {
  await call({ days: '30' });
  expect(deps.dashboard).toHaveBeenCalledWith(['repo'], expect.objectContaining({ days: 30 }));
  expect(deps.prRows).toHaveBeenCalledWith(['repo']);
});

test('an invalid range renders the guard instead of querying anything, without a second h1', async () => {
  const html = renderToStaticMarkup(await call({ days: '5' }));
  expect(html).toContain('Invalid date range');
  expect(deps.dashboard).not.toHaveBeenCalled();
  expect(deps.prRows).not.toHaveBeenCalled();
  expect(html).not.toContain('<h1');
  expect(html).toContain('<h2>Invalid date range</h2>');
});

test('renders only one h1 worth of identity — the view starts at h2', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).not.toContain('<h1');
  expect(html).toContain('<h2>Delivery</h2>');
});
