import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { repositories, installations } from '../db/schema';
import { env } from '../lib/env';
import { userClient } from './session';
import { authorizeRepository, type RepositoryGrant } from './authorization';
import { reconcileInstallation } from '../github/repositories';

async function availableRepositories() {
  return db()
    .select({ repo: repositories, installation: installations })
    .from(repositories)
    .innerJoin(installations, eq(installations.id, repositories.installationId))
    .where(
      and(
        eq(repositories.active, true),
        eq(installations.active, true),
        eq(repositories.isDemo, false),
      ),
    );
}

export async function githubAccessibleRepositories(refresh = false) {
  if (env().DEMO_MODE === 'true')
    return (
      await db()
        .select()
        .from(repositories)
        .where(and(eq(repositories.isDemo, true), eq(repositories.active, true)))
    ).map((r) => ({ ...r, canAdmin: false }));
  const client = await userClient();
  const installs = await client.paginate(client.rest.apps.listInstallationsForAuthenticatedUser, {
    per_page: 100,
  });
  const grants: RepositoryGrant[] = [];
  for (const installation of installs) {
    if (installation.suspended_at) continue;
    const repos = await client.paginate(
      client.rest.apps.listInstallationReposForAuthenticatedUser,
      { installation_id: installation.id, per_page: 100 },
    );
    for (const repo of repos)
      grants.push({
        githubRepositoryId: String(repo.id),
        installationId: String(installation.id),
        admin: repo.permissions?.admin === true,
      });
  }
  const localInstallations = await db().select().from(installations);
  let available = await availableRepositories();
  const missing = new Set(
    installs
      .filter((installation) => !installation.suspended_at)
      .filter((installation) => {
        const installationId = String(installation.id);
        return (
          refresh ||
          !localInstallations.some((local) => local.githubInstallationId === installationId) ||
          grants.some(
            (grant) =>
              grant.installationId === installationId &&
              !available.some(
                ({ repo, installation: local }) =>
                  local.githubInstallationId === grant.installationId &&
                  repo.githubRepositoryId === grant.githubRepositoryId,
              ),
          )
        );
      })
      .map((installation) => String(installation.id)),
  );
  for (const installationId of missing) await reconcileInstallation(installationId);
  if (missing.size) available = await availableRepositories();
  return available
    .filter(({ repo, installation }) =>
      authorizeRepository({ ...repo, installationId: installation.githubInstallationId }, grants),
    )
    .map(({ repo, installation }) => ({
      ...repo,
      canAdmin: authorizeRepository(
        { ...repo, installationId: installation.githubInstallationId },
        grants,
        true,
      ),
    }));
}
export {
  accessibleRepositories,
  linkRepository,
  unlinkRepository,
  requireRepository,
  requireTrackedRepository,
} from '../workspaces/access';
