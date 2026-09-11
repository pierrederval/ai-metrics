import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../index';
import { installations, repositories } from '../schema';
import { actEnabled, setActEnabled } from './act-settings';

const fixtures: string[] = [];

async function seed() {
  const id = randomUUID();
  fixtures.push(id);
  await db()
    .insert(installations)
    .values({ id, githubInstallationId: id, accountLogin: 'test', accountType: 'User' });
  await db().insert(repositories).values({
    id,
    installationId: id,
    githubRepositoryId: id,
    owner: 'test',
    name: 'checkout-service',
    defaultBranch: 'main',
    isPrivate: false,
  });
  return id;
}

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
});

afterAll(async () => {
  if (fixtures.length) {
    await db().delete(repositories).where(inArray(repositories.id, fixtures));
    await db().delete(installations).where(inArray(installations.id, fixtures));
  }
  await closeDb();
});

describe('act opt-in', () => {
  it('is off for a repository nobody asked about', async () => {
    expect(await actEnabled(await seed())).toBe(false);
  });

  it('turns on and back off', async () => {
    const id = await seed();
    await setActEnabled(id, true);
    expect(await actEnabled(id)).toBe(true);
    await setActEnabled(id, false);
    expect(await actEnabled(id)).toBe(false);
  });

  it('reports off for a repository that does not exist', async () => {
    expect(await actEnabled(randomUUID())).toBe(false);
  });
});
