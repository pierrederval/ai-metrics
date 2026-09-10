import { useId, type CSSProperties } from 'react';
import { gradePresentation } from '../../domain/grading/presentation';
import './grade-card.css';
const finishes = {
  common: 'Common · Flat finish',
  shimmer: 'Shimmer · Light holo',
  bronze: 'Bronze · Holographic',
  silver: 'Silver · Holographic',
  gold: 'Gold · Holographic',
  rainbow: 'Prismatic · Perfect score',
};
export function GradeCard({
  score,
  repositoryName,
  sha,
  rubricVersion,
}: {
  score: number;
  repositoryName: string;
  sha: string;
  rubricVersion: string;
}) {
  const grade = gradePresentation(score);
  const gradient = useId();
  return (
    <section
      className="grade-card"
      data-finish={grade.finish}
      style={{ '--grade': grade.color } as CSSProperties}
      aria-label={`Agent readiness: ${score} out of 100, ${grade.label}`}
    >
      <div className="grade-card-inner">
        <div className="grade-card-heading">
          <span>{repositoryName}</span>
          <span className="grade-card-symbols" aria-hidden="true">
            {Array.from({ length: grade.count }, (_, i) => (
              <svg
                key={i}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={grade.finish === 'rainbow' ? `url(#${gradient})` : 'currentColor'}
              >
                <defs>
                  <linearGradient id={i === 0 ? gradient : `${gradient}-${i}`}>
                    <stop stopColor="#a45aa7" />
                    <stop offset=".5" stopColor="#489aaf" />
                    <stop offset="1" stopColor="#a77322" />
                  </linearGradient>
                </defs>
                {grade.symbol === 'circle' ? (
                  <circle cx="12" cy="12" r="7" />
                ) : (
                  <path d="m12 1 3.4 7 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6L1 9.1 8.6 8z" />
                )}
              </svg>
            ))}
          </span>
        </div>
        <h2>Agent Readiness</h2>
        <div className="grade-card-scoreline">
          <div className="grade-card-score">
            {score}
            <small> / 100</small>
          </div>
          <span className="grade-card-rating">{grade.label}</span>
        </div>
        <div className="grade-card-scale" aria-label="Grade thresholds: 0, 50, 70, 80, 90, 100">
          <i />
          <i />
          <i />
          <i />
          <i />
          <svg
            className="grade-card-pointer"
            style={{ left: `${score}%` }}
            width="14"
            height="12"
            viewBox="0 0 14 12"
            aria-hidden="true"
          >
            <path fill="currentColor" d="M0 0h14L7 10z" />
          </svg>
        </div>
        <div className="grade-card-scale-labels" aria-hidden="true">
          {[0, 50, 70, 80, 90, 100].map((n) => (
            <span key={n} style={{ left: `${n}%` }}>
              {n}
            </span>
          ))}
        </div>
        <p className="grade-card-level">Level 1 · Foundations</p>
        <p className="grade-card-finish">{finishes[grade.finish]}</p>
        <div className="grade-card-rubric">
          <span>Rubric</span>
          <strong>Readiness v{rubricVersion}</strong>
        </div>
        <p className="grade-card-commit">Commit {sha.slice(0, 7)}</p>
      </div>
    </section>
  );
}
