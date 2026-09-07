import { createHash } from 'node:crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '..';
import * as s from '../schema';
import { analyzePullRequest } from '../../domain/pull-request/analyzer';
import { canonicalChecks } from '../../domain/pull-request/attempts';
import type { PullRequestFacts, Gate } from '../../domain/pull-request/types';
export const stableId = (...values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values)).digest('hex');
export type PrInput = Omit<typeof s.pullRequests.$inferInsert, 'createdAt' | 'updatedAt'>;
type Transaction = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];
async function project(tx: Transaction, id: string, repositoryId: string, facts: PullRequestFacts) {
  const [policy] = await tx
    .select()
    .from(s.gatePolicies)
    .where(eq(s.gatePolicies.repositoryId, repositoryId))
    .orderBy(desc(s.gatePolicies.version))
    .limit(1);
  const { metrics } = analyzePullRequest(facts, policy ?? { version: 0, gates: [] });
  const values = { id, pullRequestId: id, ...metrics, projection: metrics, computedAt: new Date() };
  await tx
    .insert(s.prMetrics)
    .values(values)
    .onConflictDoUpdate({ target: s.prMetrics.pullRequestId, set: values });
}
export async function persistPr(input: PrInput) {
  return db().transaction(async (tx) => {
    // Repository lock coordinates policy changes with fact/projection updates.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.repositoryId},0))`);
    const [existing] = await tx
      .select()
      .from(s.pullRequests)
      .where(eq(s.pullRequests.id, input.id));
    const fresh = !existing || input.sourceUpdatedAt >= existing.sourceUpdatedAt;
    const base = fresh ? input.facts : existing.facts;
    const combined: PullRequestFacts = {
      ...base,
      checks: canonicalChecks([...(existing?.facts.checks ?? []), ...input.facts.checks]),
    };
    // Keep observed revision edges even when a force push removes them from API history.
    combined.revisions = [
      ...new Map(
        [...(existing?.facts.revisions ?? []), ...input.facts.revisions].map((r) => [
          stableId(r.sha, r.previousSha, r.observedAt),
          r,
        ]),
      ).values(),
    ];
    const row = { ...(fresh ? input : existing), facts: combined, updatedAt: new Date() };
    await tx
      .insert(s.pullRequests)
      .values(row)
      .onConflictDoUpdate({ target: s.pullRequests.id, set: row });
    for (const revision of combined.revisions) {
      await tx
        .insert(s.commits)
        .values({
          id: stableId(input.id, revision.sha),
          pullRequestId: input.id,
          sha: revision.sha,
        })
        .onConflictDoNothing();
      await tx
        .insert(s.revisions)
        .values({
          id: stableId(input.id, revision.sha, revision.previousSha, revision.observedAt),
          pullRequestId: input.id,
          sha: revision.sha,
          previousSha: revision.previousSha,
          observedAt: revision.observedAt ? new Date(revision.observedAt) : null,
          diffComplete: revision.diffComplete,
        })
        .onConflictDoUpdate({
          target: s.revisions.id,
          set: { diffComplete: revision.diffComplete },
        });
    }
    for (const check of combined.checks) {
      const runId = stableId(
          input.repositoryId,
          check.sha,
          check.workflowRunId ?? check.id,
          check.execution,
        ),
        checkId = stableId(runId, check.id);
      await tx
        .insert(s.ciRuns)
        .values({
          id: runId,
          repositoryId: input.repositoryId,
          headSha: check.sha,
          githubRunId: check.workflowRunId ?? null,
          runAttempt: check.execution,
          name: check.workflowName ?? check.name,
          status: check.status,
          conclusion: check.conclusion,
        })
        .onConflictDoUpdate({
          target: s.ciRuns.id,
          set: { status: check.status, conclusion: check.conclusion, updatedAt: new Date() },
        });
      await tx
        .insert(s.prRuns)
        .values({ pullRequestId: input.id, ciRunId: runId })
        .onConflictDoNothing();
      const values = {
        id: checkId,
        ciRunId: runId,
        githubCheckRunId: check.id,
        appId: check.appId,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        startedAt: check.startedAt ? new Date(check.startedAt) : null,
        completedAt: check.completedAt ? new Date(check.completedAt) : null,
        normalized: check,
      };
      await tx
        .insert(s.ciChecks)
        .values(values)
        .onConflictDoUpdate({ target: s.ciChecks.id, set: { ...values, updatedAt: new Date() } });
      await tx
        .insert(s.observations)
        .values({ id: stableId(checkId, check), ciCheckId: checkId, payload: check })
        .onConflictDoNothing();
    }
    const groups = [
      { files: combined.files, sha: null, from: null, provenance: 'pr-cumulative' },
      ...combined.revisions.map((r) => ({
        files: r.files,
        sha: r.sha,
        from: r.previousSha,
        provenance: 'revision-comparison',
      })),
    ];
    for (const group of groups)
      for (const file of group.files) {
        const values = {
          id: stableId(input.id, group.provenance, group.sha, group.from, file.path),
          pullRequestId: input.id,
          commitSha: group.sha,
          fromSha: group.from,
          provenance: group.provenance,
          path: file.path,
          changeType: file.changeType,
          additions: file.additions,
          deletions: file.deletions,
          normalized: file,
        };
        await tx
          .insert(s.changedFiles)
          .values(values)
          .onConflictDoUpdate({ target: s.changedFiles.id, set: values });
      }
    await project(tx, input.id, input.repositoryId, combined);
    return input.id;
  });
}
export async function recomputePr(id: string) {
  await db().transaction(async (tx) => {
    const [pr] = await tx.select().from(s.pullRequests).where(eq(s.pullRequests.id, id));
    if (!pr) throw new Error('PR not found');
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pr.repositoryId},0))`);
    const [current] = await tx.select().from(s.pullRequests).where(eq(s.pullRequests.id, id));
    await project(tx, id, pr.repositoryId, current.facts);
  });
}
export async function setGatePolicy(repositoryId: string, gates: Gate[]) {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${repositoryId},0))`);
    const [previous] = await tx
      .select()
      .from(s.gatePolicies)
      .where(eq(s.gatePolicies.repositoryId, repositoryId))
      .orderBy(desc(s.gatePolicies.version))
      .limit(1);
    const version = (previous?.version ?? 0) + 1;
    await tx.insert(s.gatePolicies).values({ repositoryId, version, gates });
    const prs = await tx
      .select()
      .from(s.pullRequests)
      .where(eq(s.pullRequests.repositoryId, repositoryId));
    for (const pr of prs) await project(tx, pr.id, repositoryId, pr.facts);
    return version;
  });
}
