import { checkTitles } from '../../domain/grading/check-titles';

/**
 * The five readiness checks, at twenty points each.
 *
 * The titles are read from `checkTitles`, never a hand-typed copy: a rubric
 * that grows a sixth check should grow a sixth card here without anyone
 * remembering to come back and add one.
 *
 * A readiness check is one of the rubric's five criteria. It is not a CI check.
 */
const WHAT_IT_LOOKS_FOR: Record<string, string> = {
  'root-agent-instructions': 'A file at the root that tells an agent how this repository works.',
  'root-readme': 'A README that says what the project is before it says how to run it.',
  'docs-markdown': 'Documentation under docs/, so there is somewhere to look that is not the code.',
  'documented-setup': 'The commands that get a working checkout, written down.',
  'documented-tests': 'The commands that verify a change — the ones an agent needs to check itself.',
};

export function RubricGrid() {
  const checks = Object.entries(checkTitles);
  return (
    <section className="mk-section" id="rubric">
      <p className="eyebrow">The rubric</p>
      <h2>Five checks, twenty points each.</h2>
      <p className="mk-lede">
        No model decides the score. Each check is a deterministic read of the repository, and every
        failing one records the paths and line ranges that prove it — so the grade is an argument
        you can inspect, not an opinion you have to take on trust.
      </p>
      <ul className="mk-rubric">
        {checks.map(([id, title]) => (
          <li key={id} className="fn-stat-card">
            <span className="t">20 points</span>
            <span className="v">{title}</span>
            <span className="s">{WHAT_IT_LOOKS_FOR[id]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
