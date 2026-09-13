/** The four promises the architecture actually makes. Each one is a property
 *  of how the numbers are produced, not a policy someone could quietly drop. */
const GUARANTEES = [
  [
    'No LLM judges',
    'Nothing in the scoring path asks a model for an opinion. Every check is a deterministic read of the repository.',
  ],
  [
    'Recomputed, not stored',
    'Metrics are projected from raw facts on every read. There is no cached number that can drift away from the evidence under it.',
  ],
  [
    'Replays identically',
    'The same facts and the same gate policy always produce the same numbers. A grade you disagree with can be re-run and argued with.',
  ],
  [
    'Unknown stays unknown',
    'When the evidence cannot support a claim, the answer is unknown — never a default, never a zero quietly counted as a failure.',
  ],
] as const;

export function Guarantees() {
  return (
    <section className="mk-section" id="guarantees">
      <p className="eyebrow">The guarantees</p>
      <h2>Evidence first, or it does not count.</h2>
      <ul className="mk-guarantees">
        {GUARANTEES.map(([title, body]) => (
          <li key={title} className="fn-stat-card">
            <span className="v">{title}</span>
            <span className="s">{body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
