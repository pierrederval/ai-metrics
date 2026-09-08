import type { RepositoryRecord } from '../../db/queries/repository-records';
export function githubRepositoryUrl(repo: { owner: string; name: string }) {
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}
function timestamp(value: string | null) {
  return value ? (
    <time dateTime={value}>{value.slice(0, 16).replace('T', ' ')} UTC</time>
  ) : (
    'Not recorded'
  );
}
export function RepositoryMetadata({
  record,
  githubUrl,
}: {
  record: RepositoryRecord;
  githubUrl: string;
}) {
  return (
    <>
      <p className="evidence-detected">
        {record.reviewDetected && record.ciDetected
          ? 'Review + CI detected'
          : record.reviewDetected
            ? 'Review detected'
            : record.ciDetected
              ? 'CI detected'
              : 'No review or CI detected'}{' '}
        in accessible PR history
      </p>
      <dl className="repository-metadata">
        <div>
          <dt>Last successful fetch</dt>
          <dd>
            {timestamp(record.lastSuccessfulFetch?.at ?? null)}
            <small>
              {record.lastSuccessfulFetch?.source ?? 'No completed collection recorded'}
            </small>
          </dd>
        </div>
        <div>
          <dt>Latest collection attempt / state</dt>
          <dd>
            {record.latestAttempt?.status ?? 'Not recorded'} ·{' '}
            {timestamp(record.latestAttempt?.at ?? null)}
            <small>{record.latestAttempt?.source}</small>
          </dd>
        </div>
        <div>
          <dt>Latest imported PR activity</dt>
          <dd>{timestamp(record.latestPrActivity)}</dd>
        </div>
        <div>
          <dt>Accessible history</dt>
          <dd>{record.accessiblePrCount} PRs · Free</dd>
        </div>
        <div>
          <dt>Latest 100 import</dt>
          <dd>{record.importState}</dd>
        </div>
        <div>
          <dt>Background history</dt>
          <dd>{record.historyState}</dd>
        </div>
      </dl>
      {(!record.reviewDetected || !record.ciDetected) && (
        <p className="metric-advisory">
          {!record.reviewDetected && !record.ciDetected
            ? 'No review or CI detected.'
            : !record.reviewDetected
              ? 'No review detected.'
              : 'No CI detected.'}{' '}
          Imports continue. Green metrics use review and CI evidence where present; an incomplete
          scan cannot establish configuration absence.{' '}
          <a href={githubUrl}>Review repository on GitHub ↗</a>
        </p>
      )}
    </>
  );
}
