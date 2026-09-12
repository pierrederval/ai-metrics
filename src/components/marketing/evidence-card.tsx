import { Notice } from '@fieldnote/design-system';
import { demoFacts, demoPolicy } from '../../demo/fixtures';
import { analyzePullRequest } from '../../domain/pull-request/analyzer';

// `demo-pr-4` — the README's "that single PR is the whole thesis". Ids in the
// seed are one-based over the fixture index, so the fourth PR is index 3.
const DEMO_SIGNAL_INDEX = 3;

/**
 * The evidence behind the pitch, computed rather than quoted.
 *
 * Every figure below comes from running the real analyzer over the real demo
 * fixture, so this card cannot claim an outcome the product would not show.
 * If the analyzer's verdict on this PR ever changes, the marketing page
 * changes with it — which is the only honest way to put a number on a landing
 * page.
 */
export function EvidenceCard() {
  const { metrics } = analyzePullRequest(demoFacts(DEMO_SIGNAL_INDEX), demoPolicy);
  const minutes =
    metrics.timeToFirstGreenSeconds === null
      ? null
      : Math.round(metrics.timeToFirstGreenSeconds / 60);

  return (
    <div className="fn-surface mk-evidence">
      <p className="eyebrow">Worked example · demo-pr-4 · “Update checkout harness”</p>
      <h3>Green, and still not clean.</h3>
      <ol className="mk-sequence">
        <li>
          <span className="mk-step">1</span> CI fails on the first revision.
        </li>
        <li>
          <span className="mk-step">2</span> The next revision changes{' '}
          <code>tests/checkout.spec.ts</code> — a test file, not the code under test.
        </li>
        <li>
          <span className="mk-step">3</span> CI turns green
          {minutes === null ? '' : ` ${minutes} minutes later`}.
        </li>
      </ol>
      <dl className="mk-verdict">
        <div>
          <dt>First pass green</dt>
          <dd>{metrics.firstPassGreen ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Attempts to green</dt>
          <dd>{metrics.attemptsToGreen}</dd>
        </div>
        <div>
          <dt>Harness changed after failure</dt>
          <dd>{metrics.harnessChangedAfterFailure ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Clean green</dt>
          <dd>{metrics.cleanGreen ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
      <Notice>
        In every dashboard you already own, this pull request looks exactly like a good one.
      </Notice>
    </div>
  );
}
