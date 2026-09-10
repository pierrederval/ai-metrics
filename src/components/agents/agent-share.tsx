import './agent-share.css';

/**
 * Both figures here come from the same CohortTable object loadCohorts
 * already assembled (attributedPullRequests / totalPullRequests) — never
 * from a separate count query. loadCohorts inner-joins pr_metrics, so its
 * total can legitimately be lower than the repository's raw visible
 * pull-request count; deriving the share and its detail line from one
 * object makes them consistent by construction instead of letting two
 * independently-queried counts drift apart.
 */
export function formatAgentShare(
  attributed: number,
  total: number,
): { percent: string; detail: string } {
  if (total <= 0) {
    return { percent: '—', detail: 'No pull requests in this range.' };
  }
  const withoutEvidence = Math.max(0, total - attributed);
  const noun = total === 1 ? 'pull request' : 'pull requests';
  return {
    percent: `${Math.round((attributed / total) * 100)}%`,
    // The remainder is reported as its own figure and never implied to be human.
    detail: `${attributed} of ${total} ${noun} carry agent evidence. ${withoutEvidence} show none.`,
  };
}

// Server component: renders static data, no interactivity.
export function AgentShare({ attributed, total }: { attributed: number; total: number }) {
  const { percent, detail } = formatAgentShare(attributed, total);
  return (
    <div className="bigcard">
      <span className="t">Agent share of work</span>
      <span className="v">{percent}</span>
      <span className="s">{detail}</span>
    </div>
  );
}
