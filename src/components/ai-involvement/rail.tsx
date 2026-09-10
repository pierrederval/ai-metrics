import Link from 'next/link';
import { AgentMark } from './marks';
import { catalogue } from '../../domain/ai-involvement/catalogue';
import type { Detection } from '../../domain/ai-involvement/types';
import type { DetectionState } from '../../db/queries/ai-involvement';

const MAX_ROWS = 4;

const rank = (detection: Detection) => (detection.signal === 'executed' ? 0 : 1);

// Pure by design (see task-5 brief): the test imports only this, no React.
export function railRows(detections: Detection[]): {
  shown: Detection[];
  hiddenCount: number;
} {
  const sorted = [...detections].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.occurrences ?? 0) - (a.occurrences ?? 0) ||
      (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''),
  );
  return {
    shown: sorted.slice(0, MAX_ROWS),
    hiddenCount: Math.max(0, sorted.length - MAX_ROWS),
  };
}

function agentLabel(agent: Detection['agent']) {
  return catalogue.find((entry) => entry.agent === agent)?.label ?? agent;
}

function rowState(detection: Detection): { className: string; text: string } {
  if (detection.signal === 'executed')
    return { className: 'ran', text: `Ran, ${detection.occurrences ?? 0} PRs` };
  if (detection.signal === 'configured') return { className: 'setup', text: 'Set up, idle' };
  return { className: 'none', text: 'Declared' };
}

function formatStamp(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

export function AiInvolvementRail({
  detections,
  state,
  repoId,
}: {
  detections: Detection[];
  state: DetectionState | null;
  repoId: string;
}) {
  const href = `/repos/${encodeURIComponent(repoId)}/ai-involvement`;
  const { shown, hiddenCount } = railRows(detections);
  return (
    <aside className="ai-rail">
      <div className="ai-rail-top">
        <span className="ai-rail-title">AI involvement</span>
        <span className="ai-rail-ver">v0.1</span>
      </div>
      {state ? (
        shown.length > 0 ? (
          <>
            <div className="ai-rail-list">
              {shown.map((detection) => {
                const row = rowState(detection);
                return (
                  <div className="ai-rail-row" key={detection.agent}>
                    <AgentMark agent={detection.agent} />
                    <span className="ai-rail-name">{agentLabel(detection.agent)}</span>
                    <span className={`ai-rail-state ${row.className}`}>{row.text}</span>
                  </div>
                );
              })}
            </div>
            {hiddenCount > 0 && <div className="ai-rail-more">+{hiddenCount} more</div>}
          </>
        ) : (
          <p className="ai-rail-empty">
            <b>No AI involvement detected.</b> No agent found in accessible pull request history.
          </p>
        )
      ) : (
        <p className="ai-rail-empty">
          <b>Not scanned yet.</b> This repository has not been checked for AI involvement.
        </p>
      )}
      <div className="ai-rail-foot">
        <span className="ai-rail-stamp">
          {state?.executedRefreshedAt
            ? `Scanned ${formatStamp(state.executedRefreshedAt)}`
            : 'Not scanned yet'}
        </span>
        <Link className="ai-rail-link" href={href}>
          View detail →
        </Link>
      </div>
    </aside>
  );
}
