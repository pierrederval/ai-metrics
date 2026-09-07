import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { githubEvents, commits } from '../db/schema';
import { persistPr, stableId } from '../db/queries/persist-pr';
import { repositoryClient } from './repositories';
import { prSchema, normalizeFile, normalizeCheck, errorStatus } from './normalize';
import { collectChecks } from './collect-checks';
import type { Revision, PullRequestFacts } from '../domain/pull-request/types';
import { z } from 'zod';
const edgeSchema = z.object({
  action: z.string(),
  before: z.string().optional(),
  pull_request: z.object({
    head: z.object({ sha: z.string() }),
    updated_at: z.string(),
    created_at: z.string(),
  }),
});
export async function syncPullRequest(repositoryId: string, number: number) {
  const { repo, client } = await repositoryClient(repositoryId),
    args = { owner: repo.owner, repo: repo.name, pull_number: number };
  const pr = prSchema.parse((await client.rest.pulls.get(args)).data),
    issues: string[] = [];
  const remoteCommits = await client.paginate(client.rest.pulls.listCommits, {
    ...args,
    per_page: 100,
  });
  const files = await client.paginate(client.rest.pulls.listFiles, { ...args, per_page: 100 });
  if (pr.changed_files !== undefined && files.length < pr.changed_files)
    issues.push('Cumulative PR file list truncated');
  if (pr.commits !== undefined && remoteCommits.length < pr.commits)
    issues.push('PR commit list truncated');
  const raw = await db()
    .select()
    .from(githubEvents)
    .where(
      and(
        eq(githubEvents.repositoryId, repo.githubRepositoryId),
        eq(githubEvents.eventName, 'pull_request'),
        sql`${githubEvents.payload}->'pull_request'->>'number'=${String(number)}`,
      ),
    );
  const edges: Revision[] = [];
  let opened = false;
  for (const event of raw) {
    const parsed = edgeSchema.safeParse(event.payload);
    if (!parsed.success) continue;
    const p = parsed.data;
    if (p.action === 'opened') {
      opened = true;
      edges.push({
        sha: p.pull_request.head.sha,
        previousSha: null,
        observedAt: p.pull_request.created_at,
        files: [],
        diffComplete: true,
      });
    } else if (p.action === 'synchronize')
      edges.push({
        sha: p.pull_request.head.sha,
        previousSha: p.before ?? null,
        observedAt: p.pull_request.updated_at,
        files: [],
        diffComplete: false,
      });
  }
  const observedShas = new Set(edges.map((r) => r.sha));
  const shas = [...new Set([...remoteCommits.map((c) => c.sha), ...observedShas, pr.head.sha])];
  for (const sha of shas)
    if (!observedShas.has(sha))
      edges.push({ sha, previousSha: null, observedAt: null, files: [], diffComplete: false });
  for (const edge of edges) {
    if (!edge.previousSha) continue;
    try {
      const { data } = await client.rest.repos.compareCommits({
        owner: repo.owner,
        repo: repo.name,
        base: edge.previousSha,
        head: edge.sha,
        per_page: 100,
        page: 1,
      });
      edge.files = (data.files ?? []).map(normalizeFile);
      // Compare returns a three-dot diff, only valid as a revision diff for a forward ancestry edge.
      edge.diffComplete =
        data.merge_base_commit.sha === edge.previousSha && edge.files.length < 300;
      if (!edge.diffComplete)
        issues.push(`Revision diff incomplete or divergent: ${edge.previousSha} → ${edge.sha}`);
    } catch (error) {
      if (![404, 410, 422].includes(errorStatus(error) ?? 0)) throw error;
      issues.push(`Revision comparison unavailable: ${edge.sha}`);
    }
  }
  const checks = [];
  for (const sha of shas)
    checks.push(...(await collectChecks(client, repo.owner, repo.name, sha, issues)));
  const checkEvents = await db()
    .select()
    .from(githubEvents)
    .where(
      and(
        eq(githubEvents.repositoryId, repo.githubRepositoryId),
        eq(githubEvents.eventName, 'check_run'),
      ),
    );
  for (const event of checkEvents) {
    const payload = event.payload.check_run;
    const parsed = z.object({ head_sha: z.string() }).safeParse(payload);
    if (parsed.success && shas.includes(parsed.data.head_sha)) {
      const normalized = normalizeCheck(payload);
      const hydrated = checks.find((c) => c.id === normalized.id);
      if (hydrated?.workflowRunId) continue; // Per-attempt Actions jobs already preserve these executions.
      checks.push(normalized);
    }
  }
  // Non-Actions providers can reuse a check ID on rerun: distinct start timestamps identify executions.
  const starts = new Map<string, string[]>();
  for (const check of checks)
    if (!check.workflowRunId) {
      const values = starts.get(check.id) ?? [];
      if (check.startedAt && !values.includes(check.startedAt)) values.push(check.startedAt);
      starts.set(check.id, values.sort());
    }
  for (const check of checks)
    if (!check.workflowRunId && check.startedAt)
      check.execution = (starts.get(check.id)?.indexOf(check.startedAt) ?? 0) + 1;
  const evaluated = new Set(checks.map((c) => c.sha));
  const chronologyComplete =
    opened && [...evaluated].every((sha) => edges.some((r) => r.sha === sha && r.observedAt));
  if (!chronologyComplete)
    issues.push(
      'Historical PR head chronology unavailable; first pass and attempts to green may be unknown',
    );
  const facts: PullRequestFacts = {
    openedAt: pr.created_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
    revisions: edges,
    checks,
    files: files.map(normalizeFile),
    historyComplete: chronologyComplete && issues.length === 0,
    issues,
  };
  const id = `pr:${repo.githubRepositoryId}:${number}`;
  await persistPr({
    id,
    repositoryId,
    githubPrId: String(pr.id),
    githubPrNumber: pr.number,
    title: pr.title,
    state: pr.state,
    authorLogin: pr.user?.login ?? 'deleted',
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    openedAt: new Date(pr.created_at),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    sourceUpdatedAt: new Date(pr.updated_at),
    facts,
  });
  for (const commit of remoteCommits)
    await db()
      .update(commits)
      .set({
        authorLogin: commit.author?.login ?? null,
        committedAt: commit.commit.committer?.date ? new Date(commit.commit.committer.date) : null,
      })
      .where(eq(commits.id, stableId(id, commit.sha)));
  return id;
}
