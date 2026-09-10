import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDb } from './index';
import * as s from './schema';
import { recomputeExecutedDetections, loadDetections } from './queries/ai-involvement';

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
});

const fixtureRepositories: string[] = [];

afterAll(async () => {
  if (fixtureRepositories.length) {
    await db()
      .delete(s.repoAiDetections)
      .where(inArray(s.repoAiDetections.repositoryId, fixtureRepositories));
    await db()
      .delete(s.repoDetectionState)
      .where(inArray(s.repoDetectionState.repositoryId, fixtureRepositories));
    await db()
      .delete(s.pullRequests)
      .where(inArray(s.pullRequests.repositoryId, fixtureRepositories));
    await db().delete(s.repositories).where(inArray(s.repositories.id, fixtureRepositories));
    await db().delete(s.installations).where(inArray(s.installations.id, fixtureRepositories));
  }
  await closeDb();
});

const baseFacts = {
  openedAt: '2026-09-01T00:00:00Z',
  mergedAt: null,
  closedAt: null,
  revisions: [],
  checks: [],
  files: [],
  historyComplete: false,
  issues: [],
};

async function seedRepository() {
  const id = randomUUID();
  fixtureRepositories.push(id);
  await db()
    .insert(s.installations)
    .values({ id, githubInstallationId: id, accountLogin: 'test', accountType: 'User' });
  await db().insert(s.repositories).values({
    id,
    installationId: id,
    githubRepositoryId: id,
    owner: 'test',
    name: 'repo',
    defaultBranch: 'main',
    isPrivate: true,
  });
  return id;
}

async function seedRepositoryWithCodexBranches(count: number) {
  const repositoryId = await seedRepository();
  await db()
    .insert(s.pullRequests)
    .values(
      Array.from({ length: count }, (_, i) => ({
        id: `${repositoryId}-pr-${i}`,
        repositoryId,
        githubPrId: `${repositoryId}-pr-${i}`,
        githubPrNumber: i + 1,
        title: 'Fixture PR',
        state: 'open',
        authorLogin: 'dana',
        headSha: 'head',
        headRef: `codex/task-${i}`,
        baseSha: 'base',
        openedAt: new Date('2026-09-01'),
        sourceUpdatedAt: new Date('2026-09-01'),
        facts: baseFacts,
      })),
    );
  return repositoryId;
}

async function renameHeadRefs(repositoryId: string, headRef: string) {
  await db()
    .update(s.pullRequests)
    .set({ headRef })
    .where(eq(s.pullRequests.repositoryId, repositoryId));
}

async function seedEmptyRepository() {
  return seedRepository();
}

test('recompute writes one executed row per agent and is idempotent', async () => {
  const repositoryId = await seedRepositoryWithCodexBranches(2);
  await recomputeExecutedDetections(repositoryId);
  await recomputeExecutedDetections(repositoryId);
  const { detections, state } = await loadDetections(repositoryId);
  expect(detections).toHaveLength(1);
  expect(detections[0]).toMatchObject({ agent: 'codex', signal: 'executed', occurrences: 2 });
  expect(state?.executedRefreshedAt).not.toBeNull();
  expect(state?.configuredRefreshedAt).toBeNull();
});

test('an agent that no longer has evidence loses its executed row', async () => {
  const repositoryId = await seedRepositoryWithCodexBranches(1);
  await recomputeExecutedDetections(repositoryId);
  await renameHeadRefs(repositoryId, 'feature/thing');
  await recomputeExecutedDetections(repositoryId);
  expect((await loadDetections(repositoryId)).detections).toEqual([]);
});

test('a repository never recomputed reports no state', async () => {
  const repositoryId = await seedEmptyRepository();
  expect(await loadDetections(repositoryId)).toEqual({ detections: [], state: null });
});
