import Link from 'next/link';
import { notFound } from 'next/navigation';
import { githubAccessibleRepositories } from '../../auth/access';
import {
  accessibleRepositories,
  requireTrackedRepository,
  requireWorkspace,
} from '../../workspaces/access';
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
  const workspace = await requireWorkspace();
  const connected = await accessibleRepositories(workspace.id);
  const discovered = workspace.role === 'owner' ? await githubAccessibleRepositories() : [];
  const available = [
    ...connected,
    ...discovered.filter((candidate) => !connected.some(({ id }) => id === candidate.id)),
  ];
  const config = env().integration;
  const installUrl = config
    ? `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new`
    : '';
  const hasTracked = connected.some((repo) => repo.trackingStartedAt !== null);
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
  const choices = available.filter(
    (repo) =>
      repo.trackingStartedAt === null || !connected.some((candidate) => candidate.id === repo.id),
  );
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
      ) : workspace.role !== 'owner' ? (
        <p>
          Ask a workspace owner to connect a repository.{' '}
          <Link href="/dashboard">Return to overview</Link>
        </p>
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
