import { Badge } from '@fieldnote/design-system';
import { EvidenceCard } from './evidence-card';

/**
 * Monitor · Act · Train, with the status each leg actually has.
 *
 * The badges are the README's own words. Act is "scoring shipped", Train is
 * "designed", and the page does not get to say otherwise — a landing page that
 * promises a shipped MCP server the repository does not contain is the one
 * lie that would undermine everything else on it.
 */
const STAGES = [
  {
    name: 'Monitor',
    tone: 'positive',
    status: 'Shipped',
    body: 'Reconstruct pull-request and CI history from GitHub, then recompute deterministic metrics over it. Same facts plus same gate policy always produce the same numbers.',
  },
  {
    name: 'Act',
    tone: 'caution',
    status: 'Scoring shipped',
    body: 'Grade a repository on how workable it is for an agent. Each failing check already records what is missing and the exact paths and line ranges that prove it. The next step is opening the pull request that fixes it.',
  },
  {
    name: 'Train',
    tone: 'neutral',
    status: 'Designed',
    body: "Serve a repository's own record back to the coding agent over MCP, so it reads its history before it starts work rather than after review. The metrics are computed; what is missing is the server that speaks them.",
  },
] as const;

export function LoopStages() {
  return (
    <section className="mk-section" id="how">
      <p className="eyebrow">How it works</p>
      <h2>Monitor · Act · Train</h2>
      <div className="mk-stages">
        {STAGES.map((stage) => (
          <div key={stage.name} className="fn-surface mk-stage">
            <div className="mk-stage-top">
              <h3>{stage.name}</h3>
              <Badge tone={stage.tone}>{stage.status}</Badge>
            </div>
            <p>{stage.body}</p>
          </div>
        ))}
      </div>
      <EvidenceCard />
    </section>
  );
}
