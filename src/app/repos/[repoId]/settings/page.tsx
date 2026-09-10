import { requireTrackedRepository } from '../../../../auth/access';
import { currentPolicy, prRows } from '../../../../db/queries/dashboard';
import { latestImport } from '../../../../db/queries/repository-imports';
import { repositoryRecord } from '../../../../db/queries/repository-header';
import { ImportProgress } from '../../../../components/onboarding/import-progress';
import {
  githubRepositoryUrl,
  RepositoryMetadata,
} from '../../../../components/dashboard/repository-metadata';
import { saveGates, refreshImport } from '../actions';
import { gateKey } from '../../../../domain/pull-request/types';
import { pageRouteId } from '../../../../lib/page-route-id';

export const dynamic = 'force-dynamic';

// Settings is the required-gates form and its policy version, the import
// control (ImportProgress + the refresh form), the collection detail
// (RepositoryMetadata), and the gate-candidate discovery the form has always
// offered. It loads currentPolicy, latestImport, repositoryRecord and
// prRows:
//
// - currentPolicy + latestImport: the gate policy and the collection
//   record, as originally scoped.
// - repositoryRecord (src/db/queries/repository-header.ts): a
//   per-request-memoised single-repository lookup, NOT repositoryRecords()
//   directly. The layout calls the same cached function for the coverage
//   strip, so within one request this runs repositoryRecords()'s
//   accessible-PR-history join once, shared between the two callers,
//   instead of a second full join here.
// - prRows: NOT rendered as a table here (that's Delivery's). It exists
//   solely to derive the required-gates form's candidate list — every check
//   observed across accessible PRs, not just the checks already in the
//   policy — exactly as the old page did:
//   `[...policy.gates, ...rows.flatMap((r) => r.pr.facts.checks)]`. Without
//   it an admin could only toggle existing gates, never promote a
//   newly-seen check to one; do not "tidy this away" as an unused import.
export default async function Settings({ params }: { params: Promise<{ repoId: string }> }) {
  const repoId = pageRouteId((await params).repoId),
    repo = await requireTrackedRepository(repoId);
  const [policy, latest, record, rows] = await Promise.all([
    currentPolicy(repoId),
    latestImport(repoId),
    repositoryRecord(repoId),
    prRows([repoId]),
  ]);
  const candidates = [
    ...new Map(
      [...policy.gates, ...rows.flatMap((r) => r.pr.facts.checks)].map((g) => [
        gateKey(g),
        { appId: g.appId, name: g.name },
      ]),
    ).values(),
  ];
  return (
    <div className="metrics-page">
      <div className="eyebrow" style={{ marginTop: 28 }}>
        Repository / Settings
      </div>
      <h2>Settings</h2>
      <p className="page-intro">Configuration is not analysis: gates and collection, in one place.</p>

      <h2>Required gates</h2>
      <p className="muted">Policy v{policy.version}</p>
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

      <h2>Collection detail</h2>
      <section>
        <RepositoryMetadata record={record} githubUrl={githubRepositoryUrl(repo)} />
      </section>

      <h2>Data</h2>
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
      {repo.canAdmin && (!latest || latest.state === 'complete') && (
        <form action={refreshImport.bind(null, repoId)}>
          <button>Refresh latest 100 PRs</button>
        </form>
      )}
    </div>
  );
}
