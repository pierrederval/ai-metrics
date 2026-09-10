import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '..';
import * as s from '../schema';
import { visiblePrIds } from './history-access';
import { catalogue } from '../../domain/ai-involvement/catalogue';
import { UNATTRIBUTED } from '../../domain/ai-involvement/attribute';
import { aggregate } from '../../metrics/aggregate';
import type { PrMetrics } from '../../domain/pull-request/types';
import type { Range } from '../../domain/dashboard/types';
import type { CohortRow, CohortTable } from '../../domain/cohorts/types';

/** Trusted server query: repositoryId MUST come from accessibleRepositories /
 * requireTrackedRepository for the current request. This is a pull-request-level
 * metric listing, not a repository-level fact, so the Free-plan visibility limit
 * (visiblePrIds) applies — unlike loadDetections, which deliberately ignores it.
 * No date filter may precede visiblePrIds.
 */
export async function loadCohorts(repositoryId: string, range: Range): Promise<CohortTable> {
  const visible = await visiblePrIds([repositoryId]);
  if (!visible.length) return { rows: [], totalPullRequests: 0, attributedPullRequests: 0 };

  const rows = await db()
    .select({ agent: s.pullRequests.agentProvider, metrics: s.prMetrics.projection })
    .from(s.pullRequests)
    .innerJoin(s.prMetrics, eq(s.prMetrics.pullRequestId, s.pullRequests.id))
    .where(
      and(
        inArray(s.pullRequests.id, visible),
        gte(s.pullRequests.openedAt, new Date(range.start)),
        lt(s.pullRequests.openedAt, new Date(range.endExclusive)),
      ),
    );

  const byAgent = new Map<string, PrMetrics[]>();
  for (const row of rows) {
    byAgent.set(row.agent, [...(byAgent.get(row.agent) ?? []), row.metrics]);
  }

  function labelFor(agent: string): string {
    if (agent === UNATTRIBUTED) return 'Unattributed';
    // Agent ids can outlive their catalogue entry (renamed or removed); fall
    // back to the raw id rather than throwing, mirroring detectExecuted's
    // stale-agent tolerance at detect-executed.ts:126-134.
    return catalogue.find((entry) => entry.agent === agent)?.label ?? agent;
  }

  function toRow(agent: string, metrics: PrMetrics[]): CohortRow {
    const result = aggregate(metrics);
    return {
      agent,
      label: labelFor(agent),
      attributed: agent !== UNATTRIBUTED,
      pullRequestCount: metrics.length,
      firstPass: result.firstPass,
      averageAttempts: result.averageAttempts,
      clean: result.clean,
    };
  }

  const attributedRows: CohortRow[] = [];
  let unattributedRow: CohortRow | undefined;
  for (const [agent, metrics] of byAgent) {
    const row = toRow(agent, metrics);
    if (agent === UNATTRIBUTED) unattributedRow = row;
    else attributedRows.push(row);
  }
  attributedRows.sort(
    (a, b) => b.pullRequestCount - a.pullRequestCount || a.agent.localeCompare(b.agent),
  );

  const attributedPullRequests = attributedRows.reduce((sum, row) => sum + row.pullRequestCount, 0);
  const totalPullRequests = attributedPullRequests + (unattributedRow?.pullRequestCount ?? 0);

  return {
    rows: unattributedRow ? [...attributedRows, unattributedRow] : attributedRows,
    totalPullRequests,
    attributedPullRequests,
  };
}
