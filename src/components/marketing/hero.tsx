import { GradeCard } from '@fieldnote/design-system';
import { heroCard } from './sample-grades';
import { CardTilt } from './card-tilt';

/**
 * The four figures are facts about the rubric, not rounded-up marketing
 * numbers: five checks at twenty points each, six finishes, one perfect score,
 * and no model anywhere in the scoring path.
 */
const PROOF = [
  { figure: '5', label: 'readiness checks' },
  { figure: '6', label: 'finishes to earn' },
  { figure: '100', label: 'a perfect score' },
  { figure: '0', label: 'LLM judges' },
] as const;

export function Hero() {
  return (
    <section className="mk-hero">
      <div className="mk-hero-copy">
        <p className="eyebrow">Agent readiness, graded out of 100</p>
        <h1>Get your ultimate harness.</h1>
        <p className="mk-lede">
          Your coding agents are only as good as the repository you hand them. If nothing says how
          to build it, test it, or find the thing it needs to change, an agent will guess — and CI
          turning green will not tell you that it guessed wrong.
        </p>
        <p className="mk-lede">
          fieldnote grades the repository itself, out of 100, on the five things an agent needs
          before it can work unaided. Every failing check names the files and line ranges that
          prove it.
        </p>
        <div className="mk-cta">
          <a className="fn-button fn-button-lg" href="/api/auth/login">
            Try it now
          </a>
          <a className="fn-button fn-button-lg fn-button-secondary" href="/api/auth/login">
            Continue with GitHub
          </a>
        </div>
        <dl className="mk-proof">
          {PROOF.map((item) => (
            <div key={item.label}>
              <dt>{item.figure}</dt>
              <dd>{item.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mk-hero-card">
        <CardTilt>
          <GradeCard {...heroCard()} />
        </CardTilt>
      </div>
    </section>
  );
}
