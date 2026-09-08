import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db } from '../db';
import { installations, repositories } from '../db/schema';
import { assertTrackedRepository } from './repositories';

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
});
afterAll(closeDb);

test('worker guard requires an active tracked non-demo repository on an active installation', async () => {
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  await db().insert(installations).values({
    id: installationId,
    githubInstallationId: installationId,
    accountLogin: 'guard-test',
    accountType: 'User',
  });
  await db().insert(repositories).values({
    id: repositoryId,
    installationId,
    githubRepositoryId: repositoryId,
    owner: 'guard-test',
    name: 'repository',
    defaultBranch: 'main',
    isPrivate: true,
    trackingStartedAt: new Date(),
  });

  await expect(assertTrackedRepository(repositoryId)).resolves.toBeUndefined();

  await db()
    .update(installations)
    .set({ active: false })
    .where(eq(installations.id, installationId));
  await expect(assertTrackedRepository(repositoryId)).rejects.toThrow('Repository is not tracked');

  await db()
    .update(installations)
    .set({ active: true })
    .where(eq(installations.id, installationId));
  await db()
    .update(repositories)
    .set({ trackingStartedAt: null })
    .where(eq(repositories.id, repositoryId));
  await expect(assertTrackedRepository(repositoryId)).rejects.toThrow('Repository is not tracked');

  await db()
    .update(repositories)
    .set({ trackingStartedAt: new Date(), isDemo: true })
    .where(eq(repositories.id, repositoryId));
  await expect(assertTrackedRepository(repositoryId)).rejects.toThrow('Repository is not tracked');

  await db()
    .update(repositories)
    .set({ isDemo: false, active: false })
    .where(eq(repositories.id, repositoryId));
  await expect(assertTrackedRepository(repositoryId)).rejects.toThrow('Repository is not tracked');
});
