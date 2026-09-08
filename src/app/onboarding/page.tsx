import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleRepositories, requireTrackedRepository } from '../../auth/access';
import { env } from '../../lib/env';
import { getImport, latestImport } from '../../db/queries/repository-imports';
import { RepositoryPicker } from '../../components/onboarding/repository-picker';
import { ImportProgress } from '../../components/onboarding/import-progress';
export const dynamic = 'force-dynamic';
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; run?: string }>;
}) {
  const query = await searchParams;
  const available = await accessibleRepositories();
  const config = env().integration;
  const installUrl = config
    ? `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new`
    : '';
  const hasTracked = available.some((repo) => repo.trackingStartedAt !== null);
  let resumed = null;
  if (query.run && !query.repo) notFound();
  if (query.repo) {
    const repository = await requireTrackedRepository(query.repo);
    const snapshot = query.run
      ? (await getImport(query.run))?.snapshot
      : await latestImport(repository.id);
    if (query.run && (!snapshot || snapshot.repositoryId !== repository.id)) notFound();
    if (snapshot) resumed = { repository, snapshot };
  }
  const choices = available.filter((repo) => repo.trackingStartedAt === null);
  return (
    <>
      <div className="eyebrow">Connect your work</div>
      <h1>Your first engineering record.</h1>
      <p className="page-intro">Bring your pull requests and CI history into Fieldnote.</p>
      {hasTracked && <Link href="/dashboard">Back to overview</Link>}
      {resumed ? (
        <div className="onboarding-workspace">
          <h2 className="onboarding-repository-heading">
            {resumed.repository.owner}/{resumed.repository.name}
          </h2>
          <ImportProgress
            key={resumed.snapshot.id}
            initial={resumed.snapshot}
            repository={resumed.repository}
            canAdmin={resumed.repository.canAdmin}
          />
          <Link href="/onboarding">Connect another repository</Link>
        </div>
      ) : (
        <RepositoryPicker
          allConnected={!choices.length && hasTracked}
          repositories={choices.map(({ id, owner, name, isPrivate, canAdmin }) => ({
            id,
            owner,
            name,
            isPrivate,
            canAdmin,
          }))}
          installUrl={installUrl}
        />
      )}
    </>
  );
}
