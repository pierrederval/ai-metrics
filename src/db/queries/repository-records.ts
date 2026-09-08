// Trusted server query. IDs must come from current-request repository authorization.
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '..';
import {
  dashboardPrEvidence,
  foregroundHydrations,
  historyBackfills,
  pullRequests,
  repositoryImports,
} from '../schema';
import { visiblePrIds } from './history-access';
type CollectionActivity = {
  at: string;
  source: string;
  status: string;
  completionRecorded: boolean;
};
export async function repositoryRecords(repositoryIds: string[]) {
  if (!repositoryIds.length) return [];
  const visible = await visiblePrIds(repositoryIds);
  const [records, imports, foreground, history] = await Promise.all([
    visible.length
      ? db()
          .select({ pr: pullRequests, evidence: dashboardPrEvidence })
          .from(pullRequests)
          .leftJoin(dashboardPrEvidence, eq(dashboardPrEvidence.pullRequestId, pullRequests.id))
          .where(inArray(pullRequests.id, visible))
          .orderBy(desc(pullRequests.sourceUpdatedAt), desc(pullRequests.id))
      : Promise.resolve([]),
    db()
      .select()
      .from(repositoryImports)
      .where(inArray(repositoryImports.repositoryId, repositoryIds))
      .orderBy(desc(repositoryImports.createdAt), desc(repositoryImports.id)),
    db()
      .select()
      .from(foregroundHydrations)
      .where(inArray(foregroundHydrations.repositoryId, repositoryIds)),
    db()
      .select()
      .from(historyBackfills)
      .where(inArray(historyBackfills.repositoryId, repositoryIds))
      .orderBy(desc(historyBackfills.createdAt), desc(historyBackfills.id)),
  ]);
  return repositoryIds.map((repositoryId) => {
    const rows = records.filter((r) => r.pr.repositoryId === repositoryId);
    const batches = imports.filter((r) => r.repositoryId === repositoryId);
    const backfills = history.filter((r) => r.repositoryId === repositoryId);
    const activity: CollectionActivity[] = [
      ...batches.map((r) => ({
        at: (r.finishedAt ?? r.startedAt ?? r.createdAt).toISOString(),
        source: 'Latest PR import',
        completionRecorded: r.finishedAt !== null,
        status: r.state,
      })),
      ...foreground
        .filter((r) => r.repositoryId === repositoryId)
        .map((r) => ({
          at: r.updatedAt.toISOString(),
          source: 'Foreground PR fetch',
          completionRecorded: true,
          status: r.status,
        })),
      ...backfills.map((r) => ({
        at: (r.finishedAt ?? r.startedAt ?? r.createdAt).toISOString(),
        source: 'History backfill',
        completionRecorded: r.finishedAt !== null,
        status: r.status,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    // Completion timestamps certify only these recorded collection operations, not a full repository scan.
    const successful = activity.find((r) => r.status === 'complete' && r.completionRecorded);
    return {
      repositoryId,
      prs: rows.map(({ pr }) => ({
        id: pr.id,
        number: pr.githubPrNumber,
        title: pr.title,
        state: pr.mergedAt ? 'Merged' : pr.state,
        sourceUpdatedAt: pr.sourceUpdatedAt.toISOString(),
      })),
      accessiblePrCount: rows.length,
      latestPrActivity: rows[0]?.pr.sourceUpdatedAt.toISOString() ?? null,
      reviewDetected: rows.some((r) => r.evidence?.reviewExpected === true),
      ciDetected: rows.some((r) => r.evidence?.ciExpected === true || r.pr.facts.checks.length > 0),
      lastSuccessfulFetch: successful ? { at: successful.at, source: successful.source } : null,
      latestAttempt: activity[0]
        ? { at: activity[0].at, source: activity[0].source, status: activity[0].status }
        : null,
      importState: batches[0]?.state ?? 'No recorded import',
      historyState: backfills[0]?.status ?? 'Not yet discovered',
    };
  });
}
export type RepositoryRecord = Awaited<ReturnType<typeof repositoryRecords>>[number];
