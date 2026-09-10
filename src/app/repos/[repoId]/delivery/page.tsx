import Link from 'next/link';
import { requireTrackedRepository } from '../../../../auth/access';
import { loadBasicDashboard } from '../../../../db/queries/basic-dashboard';
import { prRows } from '../../../../db/queries/dashboard';
import { BasicDashboard, InvalidRange } from '../../../../components/dashboard/basic-dashboard';
import {
  readRange,
  rangeQuery,
  type RangePageProps,
  type RangeSearch,
} from '../../../../components/dashboard/range-query';
import { MetricCards } from '../../../../components/metrics';
import { PrTable } from '../../../../components/pr-table';
import { githubRepositoryUrl } from '../../../../components/dashboard/repository-metadata';
import { pageRouteId } from '../../../../lib/page-route-id';

export const dynamic = 'force-dynamic';

type Projection = 'basic' | 'gate-policy';

function readProjection(search: RangeSearch): Projection {
  const value = Array.isArray(search.projection) ? search.projection[0] : search.projection;
  return value === 'gate-policy' ? 'gate-policy' : 'basic';
}

// Delivery is the KPI cards, the three daily charts, the date range, the
// pull-request table at full width (with the Agent column Task 2's
// per-pull-request attribution makes possible), and the gate-policy
// projection as a toggle on that same table — never a separate list. It
// loads exactly the dashboard aggregation and the pull-request records:
// loadBasicDashboard and prRows. Nothing else, and in particular never
// repositoryRecords or currentPolicy — see task-7-report.md.
//
// The old page's "Failures by check name" table (failureBreakdown) is NOT
// rendered here. failureBreakdown(prs, policy) needs the current GatePolicy
// to decide which checks are gates; that is currentPolicy, which this
// route's query budget excludes (it is Settings' load under this split).
// Flagged as concern 2 in task-7-report.md pending a ruling, rather than
// either dropping the table silently or calling currentPolicy here.
export default async function Delivery({
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
        href={`/repos/${encodeURIComponent(repoId)}/delivery`}
        headingLevel="h2"
      />
    );
  }
  const [data, rows] = await Promise.all([loadBasicDashboard([repo.id], range), prRows([repoId])]);
  const projection = readProjection(search);
  const basePath = `/repos/${encodeURIComponent(repoId)}/delivery`;
  const rangeQ = rangeQuery(range, search);
  const toggleHref = (view: Projection) => {
    const params = new URLSearchParams(rangeQ.slice(1));
    if (view === 'gate-policy') params.set('projection', 'gate-policy');
    else params.delete('projection');
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  return (
    <div className="metrics-page">
      <div className="eyebrow" style={{ marginTop: 28 }}>
        Repository / Delivery
      </div>
      <h2>Delivery</h2>
      <p className="page-intro">
        Review, CI, and progress for this repository. <a href={githubRepositoryUrl(repo)}>GitHub ↗</a>
      </p>
      <BasicDashboard data={data} />
      <h2>Pull requests</h2>
      <p className="muted">
        {rows.length} accessible pull request{rows.length === 1 ? '' : 's'} with computed metrics.
        The date range above applies to the KPIs and charts, not this table.
      </p>
      <nav aria-label="Pull request projection" className="projection-toggle">
        <Link
          href={toggleHref('basic')}
          scroll={false}
          aria-current={projection === 'basic' ? 'true' : undefined}
        >
          Basic outcomes
        </Link>
        <Link
          href={toggleHref('gate-policy')}
          scroll={false}
          aria-current={projection === 'gate-policy' ? 'true' : undefined}
        >
          Gate-policy projection
        </Link>
      </nav>
      {projection === 'gate-policy' && rows.length > 0 && (
        <MetricCards metrics={rows.map((r) => r.metrics.projection)} />
      )}
      {rows.length > 0 ? (
        <PrTable rows={rows} githubUrl={githubRepositoryUrl(repo)} projection={projection} />
      ) : (
        <p>No accessible PR records imported yet.</p>
      )}
    </div>
  );
}
