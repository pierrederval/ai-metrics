import Link from 'next/link';
import type { RepositoryHeader } from '../../db/queries/repository-header';
import './coverage-strip.css';

// The product's claim is that missing evidence stays unknown rather than being
// guessed. This states that claim in one line, above every figure it qualifies.
// The six underlying collection timestamps are not here: they stay in
// RepositoryMetadata, for the case where someone is debugging collection
// rather than reading a metric.

function evidencePhrase(review: boolean, ci: boolean) {
  if (review && ci) return 'Review and CI both detected';
  if (review) return 'Review detected, no CI';
  if (ci) return 'CI detected, no review';
  return 'Neither review nor CI detected';
}

function fetchPhrase(fetched: { at: string; source: string } | null) {
  return fetched ? (
    <>
      last collected{' '}
      <time dateTime={fetched.at}>{fetched.at.slice(0, 16).replace('T', ' ')} UTC</time>
    </>
  ) : (
    'no completed collection recorded'
  );
}

function historyPhrase(historyState: string) {
  return historyState === 'complete'
    ? 'background history current'
    : `background history ${historyState.toLowerCase()}`;
}

export function CoverageStrip({
  repoId,
  coverage,
  activeImport,
}: {
  repoId: string;
  coverage: RepositoryHeader['coverage'];
  activeImport: RepositoryHeader['activeImport'];
}) {
  const complete = coverage.reviewDetected && coverage.ciDetected && !activeImport;
  const status = activeImport
    ? 'Collection in progress'
    : complete
      ? 'Evidence complete'
      : coverage.reviewDetected || coverage.ciDetected
        ? 'Evidence partial'
        : 'No evidence detected';
  return (
    <p className="coverage">
      <span className={complete ? 'cov-dot' : 'cov-dot partial'} aria-hidden="true" />
      <b>{status}</b>
      <span className="cov-detail">
        {activeImport ? (
          <>
            Importing {activeImport.completed} of {activeImport.total ?? 'an unknown number of'}{' '}
            pull requests — figures below are incomplete until it finishes ·{' '}
          </>
        ) : null}
        {evidencePhrase(coverage.reviewDetected, coverage.ciDetected)} ·{' '}
        {fetchPhrase(coverage.lastSuccessfulFetch)} · {historyPhrase(coverage.historyState)}
      </span>
      <Link className="cov-link" href={`/repos/${encodeURIComponent(repoId)}/settings`}>
        Collection detail →
      </Link>
    </p>
  );
}
