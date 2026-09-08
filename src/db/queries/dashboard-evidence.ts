import { and, eq, sql, asc } from 'drizzle-orm';
import type { PrEvidence } from '../../domain/dashboard/types';
import { db } from '..';
import * as s from '../schema';
import { stableId } from './persist-pr';

const date = (value: string | null | undefined) => (value ? new Date(value) : null);
const iso = (value: Date | null) => value?.toISOString() ?? null;
const earliest = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a < b ? a : b);

export async function persistDashboardEvidence(evidence: PrEvidence): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${evidence.repositoryId},0))`,
    );
    const [existing] = await tx
      .select()
      .from(s.dashboardPrEvidence)
      .where(eq(s.dashboardPrEvidence.pullRequestId, evidence.id));
    const incomingAt = date(evidence.sourceUpdatedAt);
    const older =
      existing?.sourceUpdatedAt && (!incomingAt || incomingAt < existing.sourceUpdatedAt);
    const newer =
      !!incomingAt && !!existing?.sourceUpdatedAt && incomingAt > existing.sourceUpdatedAt;
    const coverage = (incoming: boolean, previous: boolean | undefined) =>
      older ? (previous ?? false) : newer ? incoming : incoming || (previous ?? false);
    const provenance = Object.fromEntries(
      (['chronology', 'reviews', 'ci'] as const).map((key) => [
        key,
        [...new Set([...(existing?.provenance[key] ?? []), ...(evidence.provenance?.[key] ?? [])])],
      ]),
    );
    const retainedReviews = await tx
      .select()
      .from(s.reviewEvents)
      .where(eq(s.reviewEvents.pullRequestId, evidence.id));
    const retainedAttempts = await tx
      .select({ startedAt: s.workflowAttempts.startedAt })
      .from(s.prWorkflowAttempts)
      .innerJoin(
        s.workflowAttempts,
        and(
          eq(s.workflowAttempts.repositoryId, s.prWorkflowAttempts.repositoryId),
          eq(s.workflowAttempts.runId, s.prWorkflowAttempts.runId),
          eq(s.workflowAttempts.attempt, s.prWorkflowAttempts.attempt),
        ),
      )
      .where(eq(s.prWorkflowAttempts.pullRequestId, evidence.id));
    const cutoff = evidence.mergedAt ? Date.parse(evidence.mergedAt) : Infinity;
    const knownReview = [
      ...retainedReviews.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
      ...evidence.reviews,
    ].some(
      (r) =>
        Date.parse(r.occurredAt) <= cutoff &&
        (r.kind !== 'review' ||
          ['approved', 'changes_requested', 'dismissed'].includes(r.state.toLowerCase())),
    );
    const knownCi = [
      ...retainedAttempts.map((a) => ({ startedAt: iso(a.startedAt) })),
      ...evidence.attempts,
    ].some((a) => !a.startedAt || Date.parse(a.startedAt) <= cutoff);
    const applicability = (
      incoming: boolean | null,
      previous: boolean | null | undefined,
      retained: boolean,
    ) => {
      // Absence from a response cannot erase positive evidence retained for this PR.
      if (retained || previous === true) return true;
      if (older) return previous ?? null;
      return incoming;
    };
    const row = {
      pullRequestId: evidence.id,
      mergeHeadSha: older
        ? (existing?.mergeHeadSha ?? null)
        : (evidence.mergeHeadSha ?? existing?.mergeHeadSha ?? null),
      reviewExpected: applicability(evidence.reviewExpected, existing?.reviewExpected, knownReview),
      ciExpected: applicability(evidence.ciExpected, existing?.ciExpected, knownCi),
      chronologyComplete: coverage(evidence.chronologyComplete, existing?.chronologyComplete),
      // Review/workflow activity can change without changing the PR source timestamp.
      // Retain raw history below, but never use a PR version to promote their coverage.
      reviewsComplete: evidence.reviewsComplete,
      ciComplete: evidence.ciComplete,
      sourceUpdatedAt: older
        ? existing!.sourceUpdatedAt
        : (incomingAt ?? existing?.sourceUpdatedAt),
      provenance,
      collectedAt: new Date(),
      updatedAt: new Date(),
    };
    await tx
      .insert(s.dashboardPrEvidence)
      .values(row)
      .onConflictDoUpdate({ target: s.dashboardPrEvidence.pullRequestId, set: row });
    for (const event of evidence.reviews) {
      const id = stableId(evidence.id, 'github', event.id);
      const [previous] = await tx.select().from(s.reviewEvents).where(eq(s.reviewEvents.id, id));
      // A REST DISMISSED snapshot is less informative than the original decision.
      if (
        previous &&
        (older || (event.kind === 'review' && event.state.toLowerCase() === 'dismissed'))
      )
        continue;
      const values = {
        id,
        pullRequestId: evidence.id,
        sourceId: event.id,
        reviewerId: event.reviewerId,
        state: event.state,
        commitSha: event.commitSha,
        occurredAt: new Date(event.occurredAt),
        kind: event.kind,
        dismissedReviewId: event.dismissedReviewId,
        source: 'github',
        sourceUpdatedAt: incomingAt,
      };
      await tx
        .insert(s.reviewEvents)
        .values(values)
        .onConflictDoUpdate({ target: s.reviewEvents.id, set: values });
    }
    for (const attempt of evidence.attempts) {
      if (attempt.repositoryId !== evidence.repositoryId)
        throw new Error('Workflow attempt repository mismatch');
      const key = and(
        eq(s.workflowAttempts.repositoryId, attempt.repositoryId),
        eq(s.workflowAttempts.runId, attempt.runId),
        eq(s.workflowAttempts.attempt, attempt.attempt),
      );
      const [previous] = await tx.select().from(s.workflowAttempts).where(key);
      const updatedAt = date(attempt.sourceUpdatedAt);
      const stale =
        previous?.sourceUpdatedAt &&
        (!updatedAt ||
          updatedAt < previous.sourceUpdatedAt ||
          (updatedAt.getTime() === previous.sourceUpdatedAt.getTime() &&
            previous.status === 'completed' &&
            attempt.status !== 'completed'));
      const sameOutcome =
        previous?.status === attempt.status && previous?.conclusion === attempt.conclusion;
      if (!stale) {
        const values = {
          repositoryId: attempt.repositoryId,
          runId: attempt.runId,
          attempt: attempt.attempt,
          headSha: attempt.headSha,
          status: attempt.status,
          conclusion: attempt.conclusion,
          startedAt: date(attempt.startedAt) ?? previous?.startedAt,
          completedAt: date(attempt.completedAt) ?? (sameOutcome ? previous?.completedAt : null),
          terminalObservedAt: sameOutcome
            ? earliest(previous?.terminalObservedAt ?? null, date(attempt.terminalObservedAt))
            : date(attempt.terminalObservedAt),
          sourceUpdatedAt: updatedAt,
          updatedAt: new Date(),
        };
        await tx
          .insert(s.workflowAttempts)
          .values(values)
          .onConflictDoUpdate({
            target: [
              s.workflowAttempts.repositoryId,
              s.workflowAttempts.runId,
              s.workflowAttempts.attempt,
            ],
            set: values,
          });
      }
      await tx
        .insert(s.prWorkflowAttempts)
        .values({
          pullRequestId: evidence.id,
          repositoryId: attempt.repositoryId,
          runId: attempt.runId,
          attempt: attempt.attempt,
        })
        .onConflictDoNothing();
    }
  });
}

/** Internal evidence loader. Callers must enforce repository access and history entitlement. */
export async function loadDashboardEvidence(id: string): Promise<PrEvidence | null> {
  const [row] = await db()
    .select({ evidence: s.dashboardPrEvidence, pr: s.pullRequests })
    .from(s.dashboardPrEvidence)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.dashboardPrEvidence.pullRequestId))
    .where(eq(s.pullRequests.id, id));
  if (!row) return null;
  const reviews = await db()
    .select()
    .from(s.reviewEvents)
    .where(eq(s.reviewEvents.pullRequestId, id))
    .orderBy(asc(s.reviewEvents.occurredAt), asc(s.reviewEvents.sourceId));
  const attempts = await db()
    .select({ attempt: s.workflowAttempts })
    .from(s.prWorkflowAttempts)
    .innerJoin(
      s.workflowAttempts,
      and(
        eq(s.workflowAttempts.repositoryId, s.prWorkflowAttempts.repositoryId),
        eq(s.workflowAttempts.runId, s.prWorkflowAttempts.runId),
        eq(s.workflowAttempts.attempt, s.prWorkflowAttempts.attempt),
      ),
    )
    .where(eq(s.prWorkflowAttempts.pullRequestId, id))
    .orderBy(asc(s.workflowAttempts.runId), asc(s.workflowAttempts.attempt));
  return {
    id,
    repositoryId: row.pr.repositoryId,
    openedAt: row.pr.openedAt.toISOString(),
    mergedAt: iso(row.pr.mergedAt),
    mergeHeadSha: row.evidence.mergeHeadSha,
    reviewExpected: row.evidence.reviewExpected,
    ciExpected: row.evidence.ciExpected,
    chronologyComplete: row.evidence.chronologyComplete,
    reviewsComplete: row.evidence.reviewsComplete,
    ciComplete: row.evidence.ciComplete,
    provenance: row.evidence.provenance,
    sourceUpdatedAt: iso(row.evidence.sourceUpdatedAt),
    reviews: reviews.map((r) => ({
      id: r.sourceId,
      reviewerId: r.reviewerId,
      state: r.state,
      commitSha: r.commitSha,
      occurredAt: r.occurredAt.toISOString(),
      kind: r.kind,
      dismissedReviewId: r.dismissedReviewId,
    })),
    attempts: attempts.map(({ attempt: a }) => ({
      repositoryId: a.repositoryId,
      runId: a.runId,
      attempt: a.attempt,
      headSha: a.headSha,
      status: a.status,
      conclusion: a.conclusion,
      startedAt: iso(a.startedAt),
      completedAt: iso(a.completedAt),
      sourceUpdatedAt: iso(a.sourceUpdatedAt),
      terminalObservedAt: iso(a.terminalObservedAt),
    })),
  };
}
