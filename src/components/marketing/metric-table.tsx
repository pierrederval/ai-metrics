import { DataTable } from '@fieldnote/design-system';

/**
 * Five of the eight metrics, in the README's own wording.
 *
 * The definitions are copied from the README's table deliberately and are not
 * reworded for marketing: a metric that means something slightly different on
 * the landing page than it does in the product is worse than no landing page.
 */
const METRICS = [
  [
    'Clean Green',
    'Eventually green and the harness was not changed after failure. The headline number.',
  ],
  [
    'Harness Changed After Failure',
    'A test, CI, runner, quality, or package-configuration file changed on a later revision, after failed CI and through the first green state.',
  ],
  [
    'First Pass Green',
    "Every configured gate's first execution on the first evaluated SHA succeeded.",
  ],
  ['Attempts to Green', 'One-based SHA index of the earliest chronological green state.'],
  [
    'Agent readiness',
    'Repository score out of 100 across five documentation and instruction checks, with per-check file and line evidence.',
  ],
] as const;

export function MetricTable() {
  return (
    <section className="mk-section" id="measures">
      <p className="eyebrow">What it measures</p>
      <h2>Definitions you can hold us to.</h2>
      <DataTable>
        <table>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Definition</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(([name, definition]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
      <p className="mk-footnote">
        Outcomes stay unknown when the gate policy is unconfigured, relevant work is still pending,
        or historical evidence cannot support the claim. Aggregate rates exclude unknown values and
        always show their denominators, so missing evidence is never silently counted as either
        failure or success.
      </p>
    </section>
  );
}
