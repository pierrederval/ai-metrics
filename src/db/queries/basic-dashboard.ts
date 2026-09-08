import { and, desc, eq, inArray, isNotNull, max, or, sql } from 'drizzle-orm';
import { db } from '..';
import * as s from '../schema';
import { visiblePrIds } from './history-access';
import { loadDashboardEvidence } from './dashboard-evidence';
import { latestHistoryBackfill } from './history-backfill';
import { aggregatePeriod, comparePeriods } from '../../domain/dashboard/aggregate';
import { previousRange, UTC_DAY_MS } from '../../domain/dashboard/range';
import type {
  CoverageReason,
  DashboardData,
  PeriodAggregate,
  PrEvidence,
  Range,
} from '../../domain/dashboard/types';

/** Trusted server query: repositoryIds MUST come from accessibleRepositories / requireTrackedRepository
 * for the current request. This function enforces Free visibility, not GitHub user authorization.
 * Do not cache its result across users. No date filter may precede visiblePrIds.
 */
export async function loadBasicDashboard(
  repositoryIds: string[],
  range: Range,
): Promise<DashboardData> {
  const selected = repositoryIds.length
    ? await db()
        .select({ id: s.repositories.id })
        .from(s.repositories)
        .innerJoin(s.installations, eq(s.installations.id, s.repositories.installationId))
        .where(
          and(
            inArray(s.repositories.id, [...new Set(repositoryIds)]),
            eq(s.repositories.active, true),
            eq(s.installations.active, true),
            or(
              isNotNull(s.repositories.trackingStartedAt),
              and(eq(s.repositories.isDemo, true), sql`${process.env.NODE_ENV === 'development'}`),
            ),
          ),
        )
    : [];
  const ids = selected.map((r) => r.id);
  const visible = await visiblePrIds(ids);
  // Keep all visible evidence for both periods: PR creation/merge dates cannot
  // prefilter linked workflows whose operational completion is in either range.
  const rows = visible.length
    ? await db().select().from(s.pullRequests).where(inArray(s.pullRequests.id, visible))
    : [];
  const evidence: PrEvidence[] = [];
  for (const row of rows) {
    evidence.push(
      (await loadDashboardEvidence(row.id)) ?? {
        id: row.id,
        repositoryId: row.repositoryId,
        openedAt: row.openedAt.toISOString(),
        mergedAt: row.mergedAt?.toISOString() ?? null,
        mergeHeadSha: null,
        reviewExpected: null,
        ciExpected: null,
        chronologyComplete: false,
        reviewsComplete: false,
        ciComplete: false,
        reviews: [],
        attempts: [],
      },
    );
  }
  const contexts = await Promise.all(
    ids.map(async (id) => {
      const [history, imports, counts] = await Promise.all([
        latestHistoryBackfill(id),
        db()
          .select()
          .from(s.repositoryImports)
          .where(eq(s.repositoryImports.repositoryId, id))
          .orderBy(desc(s.repositoryImports.createdAt), desc(s.repositoryImports.id))
          .limit(1),
        db()
          .select({ count: sql<number>`count(*)::int` })
          .from(s.pullRequests)
          .where(eq(s.pullRequests.repositoryId, id)),
      ]);
      return { id, history, import: imports[0], hidden: counts[0].count > 100 };
    }),
  );
  const current = aggregatePeriod(evidence, range);
  const preceding = previousRange(range);
  const previous = aggregatePeriod(evidence, preceding);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // A finished two-sweep discovery establishes a selectable horizon even when
  // some hydration failed. It does not establish metric or Free completeness.
  const horizons = contexts.flatMap(({ id, history }) =>
    history &&
    ['complete', 'partial'].includes(history.status) &&
    history.cursor.page === null &&
    history.cursor.sweep === 1 &&
    history.finishedAt
      ? [
          {
            id,
            from: history.cutoff.slice(0, 10),
            to: history.finishedAt.toISOString().slice(0, 10),
          },
        ]
      : [],
  );
  // Later visible collection extends the picker, not the scan's coverage claim.
  // Use actual observation time, never mutable provider dates or hidden PRs.
  const discovered = new Set(horizons.map((h) => h.id));
  const collectedVisibleIds = rows
    .filter((row) => discovered.has(row.repositoryId))
    .map((row) => row.id);
  const [collection] = collectedVisibleIds.length
    ? await db()
        .select({ latest: max(s.dashboardPrEvidence.collectedAt) })
        .from(s.dashboardPrEvidence)
        .where(inArray(s.dashboardPrEvidence.pullRequestId, collectedVisibleIds))
    : [];
  const latestCollection = collection?.latest?.toISOString().slice(0, 10);
  const collectionBounds: DashboardData['collectionBounds'] = horizons.length
    ? {
        from: horizons.map((h) => h.from).sort()[0],
        to: [
          today,
          [...horizons.map((h) => h.to), ...(latestCollection ? [latestCollection] : [])]
            .sort()
            .at(-1)!,
        ].sort()[0],
        source: 'backfill-discovery',
      }
    : { from: null, to: null, source: 'unknown' };
  function applyCoverage(period: PeriodAggregate): DashboardData['coverage'] {
    const globalReasons = new Set<CoverageReason>(period.coverageReasons);
    if (!ids.length) globalReasons.add('no-repositories');
    for (const context of contexts) {
      if (
        context.import?.state !== 'complete' ||
        context.import.failed ||
        context.import.total === null ||
        context.import.completed !== context.import.total
      )
        globalReasons.add('import-incomplete');
      if (
        !context.history ||
        context.history.status !== 'complete' ||
        context.history.cursor.page !== null ||
        context.history.failed ||
        context.history.completed !== context.history.total
      )
        globalReasons.add('history-undiscovered');
      if (context.hidden) globalReasons.add('free-history-limit');
    }
    const allReasons = new Set(globalReasons);
    for (const day of period.days) {
      const reasons = new Set(globalReasons);
      if (day.date >= today) reasons.add('current-day');
      for (const { history } of contexts) {
        // Completed scans describe collection, not review/CI completeness. Only
        // full UTC days inside the scan horizon can qualify for date coverage.
        if (
          !history?.finishedAt ||
          Date.parse(`${day.date}T00:00:00Z`) < Date.parse(history.cutoff) ||
          Date.parse(`${day.date}T00:00:00Z`) + UTC_DAY_MS > history.finishedAt.getTime()
        )
          reasons.add('outside-collected-history');
      }
      for (const reason of reasons) allReasons.add(reason);
      day.coverage = reasons.size ? (rows.length ? 'partial' : 'unknown') : 'complete';
      day.mergedValue = day.merged > 0 || day.coverage === 'complete' ? day.merged : null;
    }
    period.coverageReasons = [...allReasons];
    return allReasons.size ? (rows.length ? 'partial' : 'unknown') : 'complete';
  }
  const coverage = applyCoverage(current);
  const priorCoverage = applyCoverage(previous);
  return {
    range,
    previousRange: preceding,
    days: current.days,
    previousDays: previous.days,
    totals: current.totals,
    previousTotals: previous.totals,
    visiblePrCount: visible.length,
    coverage,
    coverageReasons: current.coverageReasons,
    previousCoverageReasons: previous.coverageReasons,
    undatedCi: current.undatedCi,
    previousUndatedCi: previous.undatedCi,
    comparisons: comparePeriods(
      current.totals,
      previous.totals,
      coverage === 'complete' && priorCoverage === 'complete',
    ),
    timezone: 'UTC',
    collectionBounds,
  };
}
