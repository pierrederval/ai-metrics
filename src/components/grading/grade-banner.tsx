import type { CSSProperties } from 'react';
import { gradePresentation } from '../../domain/grading/presentation';
import './grade-banner.css';

// The phone-width stand-in for GradeCard on the Agents view. GradeCard "at
// 330 pixels consumes most of the first screen" there, so below that width
// this renders instead — score, tier and symbols, nothing else (no scale, no
// flavour, no next-tier block, so it takes no `checks`).
//
// Both this and GradeCard are always in the DOM together on the Agents view;
// which one is visible is decided purely by the .agents-view media query in
// src/app/style.css, so this component carries no viewport awareness of its
// own and stays a server component.
//
// Tier label, colour and symbol shape/count all come from gradePresentation,
// the same function GradeCard uses — nothing here re-derives a tier from the
// score.
export function GradeBanner({ score }: { score: number }) {
  const grade = gradePresentation(score);
  return (
    <div
      className="grade-banner"
      style={{ '--grade': grade.color } as CSSProperties}
      aria-label={`Agent readiness: ${score} out of 100, ${grade.label}`}
    >
      <span className="grade-banner-score">
        {score}
        <small> / 100</small>
      </span>
      <span className="grade-banner-rating">{grade.label}</span>
      <span className="grade-banner-symbols" aria-hidden="true">
        {Array.from({ length: grade.count }, (_, i) => (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {grade.symbol === 'circle' ? (
              <circle cx="12" cy="12" r="7" />
            ) : (
              <path d="m12 1 3.4 7 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6L1 9.1 8.6 8z" />
            )}
          </svg>
        ))}
      </span>
    </div>
  );
}
