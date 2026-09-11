import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '..';
import * as s from '../schema';
import { recomputeExecutedDetections } from './ai-involvement';

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(s.installations)
    .values({
      id: 'attribution-install',
      githubInstallationId: 'attribution-install',
      accountLogin: 'test',
      accountType: 'User',
    })
    .onConflictDoNothing();
  await db()
    .insert(s.repositories)
    .values({
      id: 'attribution-repo',
      installationId: 'attribution-install',
      githubRepositoryId: 'attribution-repo',
      owner: 'test',
      name: 'attribution',
      defaultBranch: 'main',
      isPrivate: true,
      trackingStartedAt: new Date(),
    })
    .onConflictDoNothing();
  await db()
    .insert(s.pullRequests)
    .values([
      {
        id: 'attribution-pr-001',
        repositoryId: 'attribution-repo',
        githubPrId: 'attribution-pr-001',
        githubPrNumber: 1,
        title: 'Add thing',
        state: 'open',
        authorLogin: 'someone',
        headSha: 'head',
        headRef: 'codex/add-thing',
        baseSha: 'base',
        openedAt: new Date('2026-09-01'),
        sourceUpdatedAt: new Date('2026-09-01'),
        facts: {
          openedAt: '2026-09-01',
          mergedAt: null,
          closedAt: null,
          revisions: [],
          checks: [],
          files: [],
          historyComplete: false,
          issues: [],
        },
      },
      {
        id: 'attribution-pr-002',
        repositoryId: 'attribution-repo',
        githubPrId: 'attribution-pr-002',
        githubPrNumber: 2,
        title: 'Manual change',
        state: 'open',
        authorLogin: 'someone',
        headSha: 'head',
        headRef: 'feature/manual',
        baseSha: 'base',
        openedAt: new Date('2026-09-01'),
        sourceUpdatedAt: new Date('2026-09-01'),
        facts: {
          openedAt: '2026-09-01',
          mergedAt: null,
          closedAt: null,
          revisions: [],
          checks: [],
          files: [],
          historyComplete: false,
          issues: [],
        },
      },
      {
        id: 'attribution-pr-003',
        repositoryId: 'attribution-repo',
        githubPrId: 'attribution-pr-003',
        githubPrNumber: 3,
        title: 'Fades to manual',
        state: 'open',
        authorLogin: 'someone',
        headSha: 'head',
        headRef: 'codex/fades-away',
        baseSha: 'base',
        openedAt: new Date('2026-09-01'),
        sourceUpdatedAt: new Date('2026-09-01'),
        facts: {
          openedAt: '2026-09-01',
          mergedAt: null,
          closedAt: null,
          revisions: [],
          checks: [],
          files: [],
          historyComplete: false,
          issues: [],
        },
      },
    ])
    .onConflictDoNothing();
});

afterAll(closeDb);

describe('recomputeExecutedDetections attribution', () => {
  it('writes the derived agent onto each pull request', async () => {
    await recomputeExecutedDetections('attribution-repo');

    const rows = await db()
      .select({ number: s.pullRequests.githubPrNumber, agent: s.pullRequests.agentProvider })
      .from(s.pullRequests)
      .where(eq(s.pullRequests.repositoryId, 'attribution-repo'));

    const byNumber = new Map(rows.map((r) => [r.number, r.agent]));
    expect(byNumber.get(1)).toBe('codex');
    expect(byNumber.get(2)).toBe('unknown');
  });

  it('clears attribution when the evidence disappears', async () => {
    await recomputeExecutedDetections('attribution-repo');

    const [before] = await db()
      .select({ agent: s.pullRequests.agentProvider })
      .from(s.pullRequests)
      .where(eq(s.pullRequests.id, 'attribution-pr-003'));
    expect(before.agent).toBe('codex');

    try {
      await db()
        .update(s.pullRequests)
        .set({ headRef: 'feature/manual' })
        .where(eq(s.pullRequests.id, 'attribution-pr-003'));
      await recomputeExecutedDetections('attribution-repo');

      const [after] = await db()
        .select({ agent: s.pullRequests.agentProvider })
        .from(s.pullRequests)
        .where(eq(s.pullRequests.id, 'attribution-pr-003'));
      expect(after.agent).toBe('unknown');
    } finally {
      await db()
        .update(s.pullRequests)
        .set({ headRef: 'codex/fades-away' })
        .where(eq(s.pullRequests.id, 'attribution-pr-003'));
      await recomputeExecutedDetections('attribution-repo');
    }
  });
});
