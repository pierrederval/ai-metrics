import { requireTrackedRepository } from '../../../../auth/access';
import { currentPolicy } from '../../../../db/queries/dashboard';
import { latestImport } from '../../../../db/queries/repository-imports';
import { ImportProgress } from '../../../../components/onboarding/import-progress';
import { saveGates, refreshImport } from '../actions';
import { gateKey } from '../../../../domain/pull-request/types';
import { pageRouteId } from '../../../../lib/page-route-id';

export const dynamic = 'force-dynamic';

// Settings is the required-gates form and its policy version, the import
// control (ImportProgress + the refresh form), and the collection detail.
// It loads exactly the gate policy and the collection record: currentPolicy
// and latestImport. Nothing else, and in particular never repositoryRecords
// or prRows — see task-7-report.md.
//
// Two things the old page rendered here are NOT rendered on this route yet:
//
// - RepositoryMetadata (the six definition rows / "collection detail") is
//   not rendered. It needs a RepositoryRecord, which only repositoryRecords()
//   produces, and the layout already calls repositoryRecords() once (via
//   loadRepositoryHeader) for the coverage strip. Calling it again here
//   would run its full accessible-PR-history join a second time per
//   request. Flagged as concern 1 in task-7-report.md pending a ruling,
//   rather than paying that second query or dropping the section silently.
//
// - The required-gates form's candidate checklist used to offer every check
//   observed across prRows, not just the checks already in the policy, so
//   an admin could promote a newly-seen check to a required gate. prRows is
//   Delivery's load under this split, so this route can only offer the
//   gates already in the policy for toggling off — it cannot surface an
//   unconfigured check as a candidate to add. Flagged as concern 3 in
//   task-7-report.md.
export default async function Settings({ params }: { params: Promise<{ repoId: string }> }) {
  const repoId = pageRouteId((await params).repoId),
    repo = await requireTrackedRepository(repoId);
  const [policy, latest] = await Promise.all([currentPolicy(repoId), latestImport(repoId)]);
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
          {policy.gates.map((g) => (
            <label key={gateKey(g)}>
              <input type="checkbox" name="gate" value={JSON.stringify(g)} defaultChecked />{' '}
              {g.name} (app {g.appId})
            </label>
          ))}
          <button>Save policy and recompute PRs</button>
        </form>
      )}

      <h2>Data</h2>
      {latest ? (
        latest.state === 'complete' ? (
          <p>{`Imported batch: ${latest.total ?? 'unknown'} PRs.`}</p>
        ) : (
          <ImportProgress
            key={latest.id}
            initial={latest}
            repository={repo}
            canAdmin={repo.canAdmin}
          />
        )
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
