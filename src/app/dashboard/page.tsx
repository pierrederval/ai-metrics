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
      <h1>Engineering reliability</h1>
      <p>Deterministic evidence from pull requests and CI executions.</p>
      <div className="cards">
        <section>
          <small>Repositories</small>
          <strong>{repositories.length}</strong>
        </section>
        <section>
          <small>PRs analyzed / created</small>
          <strong>{rows.length}</strong>
        </section>
        <section>
          <small>PRs merged</small>
          <strong>{rows.filter((r) => r.pr.mergedAt).length}</strong>
        </section>
      </div>
      <MetricCards metrics={rows.map((r) => r.metrics.projection)} />
      <h2>Repositories</h2>
      {repositories.length ? (
        repositories.map((r) => (
          <section key={r.id}>
            <Link href={`/repos/${r.id}`}>
              {r.owner}/{r.name}
            </Link>
            <p>
              Import: {r.syncStatus} · {r.syncProgress} PRs{r.isDemo ? ' · Demo fixtures' : ''}
            </p>
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
