import { assertTrackedRepository, repositoryClient } from './repositories';

export async function discoverHistoryPage(
  repositoryId: string,
  cutoff: string,
  page: number,
): Promise<{
  numbers: number[];
  nextPage: number | null;
  sourceUpdatedAt?: Record<number, string>;
}> {
  await assertTrackedRepository(repositoryId);
  const { repo, client } = await repositoryClient(repositoryId);
  const { data } = await client.rest.pulls.list({
    owner: repo.owner,
    repo: repo.name,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
    page,
  });
  const boundary = new Date(cutoff).getTime();
  if (!Number.isFinite(boundary)) throw new Error('Invalid history cutoff');
  const recent = data.filter((pr) => new Date(pr.updated_at).getTime() >= boundary);
  return {
    numbers: [...new Set(recent.map((pr) => pr.number))],
    sourceUpdatedAt: Object.fromEntries(recent.map((pr) => [pr.number, pr.updated_at])),
    nextPage: data.length === 100 && recent.length === data.length ? page + 1 : null,
  };
}
