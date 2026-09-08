export function needsOnboarding(repos: Array<{ trackingStartedAt: Date | null }>, demo: boolean) {
  return !demo && !repos.some((repo) => repo.trackingStartedAt !== null);
}
export function filterRepositoryChoices<T extends { owner: string; name: string }>(
  repos: T[],
  search: string,
): T[] {
  const query = search.trim().toLowerCase();
  return repos.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase().includes(query));
}
