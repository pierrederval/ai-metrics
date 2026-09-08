import Link from 'next/link';
import { redirect } from 'next/navigation';
import { env } from '../../lib/env';
import { needsOnboarding } from '../../domain/import/onboarding';
import { latestImport } from '../../db/queries/repository-imports';
import { accessibleRepositories, requireWorkspace } from '../../workspaces/access';
import { prRows } from '../../db/queries/dashboard';
import { MetricCards } from '../../components/metrics';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const workspace = await requireWorkspace();
  const available = await accessibleRepositories();
  const demo = env().DEMO_MODE === 'true';
  if (workspace.role === 'owner' && available.length > 0 && needsOnboarding(available, demo))
    redirect('/onboarding');
  const repositories = demo
    ? available
    : available.filter((repo) => repo.trackingStartedAt !== null);
  const rows = await prRows(repositories.map((repo) => repo.id));
  const imports = new Map(
    await Promise.all(
      repositories.map(async (repo) => [repo.id, await latestImport(repo.id)] as const),
    ),
  );
  return (
    <>
      <div className="eyebrow">Your engineering record</div>
      <h1>Good work compounds.</h1>
      <p className="page-intro">
        Follow the attempts, failures, and fixes behind every green pull request.
      </p>
      <div className="summary-strip">
        <span>
          <strong>{repositories.length}</strong> repositories
        </span>
        <span>
          <strong>{rows.length}</strong> PRs analyzed
        </span>
        <span>
          <strong>{rows.filter((r) => r.pr.mergedAt).length}</strong> merged
        </span>
      </div>
      {rows.length > 0 ? (
        <MetricCards metrics={rows.map((r) => r.metrics.projection)} />
      ) : (
        <p>No pull requests imported yet. Follow your repository’s import below.</p>
      )}
      <h2 id="repositories">Repositories</h2>
      {workspace.role === 'owner' && <Link href="/onboarding">Add repository</Link>}
      {repositories.length ? (
        repositories.map((r) => (
          <section key={r.id} className="repository-card">
            <div>
              <Link href={`/repos/${r.id}`}>
                {r.owner}/{r.name}
              </Link>
              <p>
                {imports.get(r.id)
                  ? `Import ${imports.get(r.id)!.state} · ${imports.get(r.id)!.completed} PRs imported${imports.get(r.id)!.failed ? ` · ${imports.get(r.id)!.failed} failed` : ''}`
                  : 'Existing imported history'}
                {r.isDemo ? ' · Demo fixtures' : ''}
              </p>
            </div>
            <span className="repository-arrow" aria-hidden="true">
              ↗
            </span>
          </section>
        ))
      ) : (
        <p>
          {workspace.role === 'owner'
            ? 'Connect a repository to start your engineering record.'
            : 'Ask a workspace owner to connect a repository. Your team’s engineering record will appear here.'}
        </p>
      )}
      <p className="muted">
        Rates exclude unknown outcomes. Gate policies define what green means; this is evidence, not
        a quality judgment.
      </p>
    </>
  );
}
