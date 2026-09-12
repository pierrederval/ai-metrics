import type { CSSProperties } from 'react';
import type { GradeFinish } from './grade-card';
import './grade-banner.css';

// The phone-width stand-in for GradeCard on the Agents view. GradeCard "at
// 330 pixels consumes most of the first screen" there, so below that width
// this renders instead — score, tier and symbols, nothing else (no scale, no
// flavour, no next-tier block, so it takes no next-tier moves).
//
// Both this and GradeCard are always in the DOM together on the Agents view;
// which one is visible is decided purely by the .agents-view media query in
// src/app/style.css, so this component carries no viewport awareness of its
// own and stays a server component.
//
// It travels with GradeCard rather than sitting on the other side of the
// package boundary from it: the two share the tier vocabulary, and a card and
// a banner disagreeing about what 80 looks like is exactly the drift this
// package exists to prevent.
export function GradeBanner({
  score,
  label,
  color,
  symbol,
  count,
}: {
  score: number;
  label: string;
  color: string;
  symbol: 'circle' | 'star';
  count: number;
  finish?: GradeFinish;
}) {
  return (
    <div
      className="grade-banner"
      style={{ '--grade': color } as CSSProperties}
      aria-label={`Agent readiness: ${score} out of 100, ${label}`}
    >
      <span className="grade-banner-score">
        {score}
        <small> / 100</small>
      </span>
      <span className="grade-banner-rating">{label}</span>
      <span className="grade-banner-symbols" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {symbol === 'circle' ? (
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
