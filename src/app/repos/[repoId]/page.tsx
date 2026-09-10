import Link from 'next/link';
import { loadBasicDashboard } from '../../../db/queries/basic-dashboard';
import { repositoryRecords } from '../../../db/queries/repository-records';
import { loadDetections } from '../../../db/queries/ai-involvement';
import { AiInvolvementRail } from '../../../components/ai-involvement/rail';
import { BasicDashboard, InvalidRange } from '../../../components/dashboard/basic-dashboard';
import {
  githubRepositoryUrl,
  RepositoryMetadata,
} from '../../../components/dashboard/repository-metadata';
import {
  readRange,
  rangeQuery,
  type RangePageProps,
} from '../../../components/dashboard/range-query';
import { latestImport } from '../../../db/queries/repository-imports';
import { ImportProgress } from '../../../components/onboarding/import-progress';
import { saveGates, refreshImport } from './actions';
import { gateKey } from '../../../domain/pull-request/types';
import { requireTrackedRepository } from '../../../auth/access';
import { currentPolicy, prRows } from '../../../db/queries/dashboard';
import { MetricCards } from '../../../components/metrics';
import { PrTable } from '../../../components/pr-table';
import { failureBreakdown } from '../../../metrics/aggregate';
import { pageRouteId } from '../../../lib/page-route-id';
export const dynamic = 'force-dynamic';
export default async function Repository({
  params,
  searchParams,
}: { params: Promise<{ repoId: string }> } & RangePageProps) {
  const repoId = pageRouteId((await params).repoId),
    repo = await requireTrackedRepository(repoId);
  const search = (await searchParams) ?? {};
  let range;
  try {
    range = readRange(search);
  } catch (error) {
    return (
      <InvalidRange
        message={(error as Error).message}
        href={`/repos/${encodeURIComponent(repoId)}`}
      />
    );
  }
  const data = await loadBasicDashboard([repo.id], range);
  const [record] = await repositoryRecords([repo.id]);
  const involvement = await loadDetections(repo.id);
  const query = rangeQuery(range, search);
  const rows = await prRows([repoId]),
    policy = await currentPolicy(repoId),
    latest = await latestImport(repoId);
  const candidates = [
    ...new Map(
      [...policy.gates, ...rows.flatMap((r) => r.pr.facts.checks)].map((g) => [
        gateKey(g),
        { appId: g.appId, name: g.name },
      ]),
    ).values(),
  ];
  const failures = failureBreakdown(
    rows.map((r) => r.pr),
    policy,
  );
  return (
    <div className="metrics-page">
      <Link href={`/repos${query}`}>← All repositories</Link>
      <h1>
        {repo.owner}/{repo.name}
      </h1>
      <p className="page-intro">
        Review, CI, and progress for this repository.{' '}
        <a href={githubRepositoryUrl(repo)}>GitHub ↗</a>{' '}
        <Link href={`/repos/${encodeURIComponent(repoId)}/grading`}>Agent readiness →</Link>{' '}
        <Link href={`/repos/${encodeURIComponent(repoId)}/ai-involvement`}>AI involvement →</Link>
      </p>
      <BasicDashboard data={data} />
      <div className="ai-content">
        <div className="ai-maincol">
          <h2>Repository evidence</h2>
          <section>
            <RepositoryMetadata record={record} githubUrl={githubRepositoryUrl(repo)} />
          </section>
          <h2>Recent pull requests</h2>
          <p className="muted">
            Latest source activity across accessible history; the date range above applies to
            metrics.
          </p>
          {record.prs.length ? (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pull request</th>
                    <th>Status</th>
                    <th>Source activity (UTC)</th>
                    <th>GitHub</th>
                  </tr>
                </thead>
                <tbody>
                  {record.prs.map((pr) => (
                    <tr key={pr.id}>
                      <td>
                        <Link href={`/prs/${encodeURIComponent(pr.id)}`}>
                          #{pr.number} {pr.title}
                        </Link>
                      </td>
                      <td>{pr.state}</td>
                      <td>
                        <time dateTime={pr.sourceUpdatedAt}>
                          {pr.sourceUpdatedAt.slice(0, 16).replace('T', ' ')}
                        </time>
                      </td>
                      <td>
                        <a href={`${githubRepositoryUrl(repo)}/pull/${pr.number}`}>View PR ↗</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No accessible PR records imported yet.</p>
          )}
        </div>
        <AiInvolvementRail
          detections={involvement.detections}
          state={involvement.state}
          repoId={repoId}
        />
      </div>
      <details className="advanced-analysis">
        <summary>Advanced gate analysis</summary>
        <p>
          Separate gate-policy projections · policy v{policy.version}. These metrics use your
          configured gates and do not define the basic dashboard above.
        </p>
        {latest ? (
          <>
            <p className="muted">
              Initial import: latest 100 pull requests by creation date. New activity is updated as
              it arrives.
            </p>
            {latest.state === 'complete' ? (
              <p>{`Imported batch: ${latest.total ?? 'unknown'} PRs.`}</p>
            ) : (
              <ImportProgress
                key={latest.id}
                initial={latest}
                repository={repo}
                canAdmin={repo.canAdmin}
              />
            )}
          </>
        ) : (
          <p className="muted">Existing imported history</p>
        )}
        <div>
          {repo.canAdmin && (!latest || latest.state === 'complete') && (
            <form action={refreshImport.bind(null, repoId)}>
              <button>Refresh latest 100 PRs</button>
            </form>
          )}
        </div>
        {rows.length > 0 ? (
          <MetricCards metrics={rows.map((r) => r.metrics.projection)} />
        ) : (
          <p>No pull requests to show yet.</p>
        )}
        <h2>Required gates</h2>
        <p>
          {policy.gates.map((g) => `${g.name} (app ${g.appId})`).join(', ') ||
            'Not configured — outcomes remain unknown.'}
        </p>
        {repo.canAdmin && (
          <form action={saveGates.bind(null, repoId)}>
            {candidates.map((g) => (
              <label key={gateKey(g)}>
                <input
                  type="checkbox"
                  name="gate"
                  value={JSON.stringify(g)}
                  defaultChecked={policy.gates.some((p) => gateKey(p) === gateKey(g))}
                />{' '}
                {g.name} (app {g.appId})
              </label>
            ))}
            <button>Save policy and recompute PRs</button>
          </form>
        )}
        <h2>Failures by check name</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Gate</th>
                <th>Failures</th>
                <th>Affected PRs</th>
                <th>Failure rate</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={`${f.appId}:${f.checkName}`}>
                  <td>
                    {f.checkName} <small>app {f.appId}</small>
                  </td>
                  <td>{f.failureCount}</td>
                  <td>{f.affectedPrCount}</td>
                  <td>
                    {(f.failureRate * 100).toFixed(1)}% / {f.total} executions
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Gate-policy PR records</h2>
        <PrTable rows={rows} />
      </details>
    </div>
  );
}
