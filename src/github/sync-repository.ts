import { inngest } from '../inngest/client';
import { repositoryClient } from './repositories';
export async function syncRepository(repositoryId: string) {
  return inngest.send({ name: 'github/repository.sync.requested', data: { repositoryId } });
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
