import Link from 'next/link';
import { accessibleRepositories } from '../../auth/access';
import { prRows } from '../../db/queries/dashboard';
import { MetricCards } from '../../components/metrics';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const repositories = await accessibleRepositories(),
    rows = await prRows(repositories.map((r) => r.id));
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
      <MetricCards metrics={rows.map((r) => r.metrics.projection)} />
      <h2 id="repositories">Repositories</h2>
      {repositories.length ? (
        repositories.map((r) => (
          <section key={r.id} className="repository-card">
            <div>
              <Link href={`/repos/${r.id}`}>
                {r.owner}/{r.name}
              </Link>
              <p>
                Import: {r.syncStatus} · {r.syncProgress} PRs{r.isDemo ? ' · Demo fixtures' : ''}
              </p>
            </div>
            <span className="repository-arrow" aria-hidden="true">
              ↗
            </span>
          </section>
        ))
      ) : (
        <p>
          No accessible installed repositories. Install the GitHub App on a repository to begin.
        </p>
      )}
      <p className="muted">
        Rates exclude unknown outcomes. Gate policies define what green means; this is evidence, not
        a quality judgment.
      </p>
    </>
  );
}
