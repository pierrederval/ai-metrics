import { dispatchImport } from '../inngest/dispatch-import';
import { requestRepositoryImport } from '../db/queries/repository-imports';
import type { ImportSnapshot } from '../domain/import/types';
import { repositoryClient, assertTrackedRepository } from './repositories';
export async function syncRepository(repositoryId: string): Promise<ImportSnapshot> {
  await assertTrackedRepository(repositoryId);
  const run = await requestRepositoryImport(repositoryId, 'refresh');
  await dispatchImport(run.id);
  return run;
}
export async function latestPullRequests(repositoryId: string) {
  const { repo, client } = await repositoryClient(repositoryId);
  const { data } = await client.rest.pulls.list({
    owner: repo.owner,
    repo: repo.name,
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
    page: 1,
  });
  return data.map((pr) => pr.number);
}
