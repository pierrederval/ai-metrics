import type { ReactNode } from 'react';

const TONE = {
  positive: 'fn-badge-positive',
  caution: 'fn-badge-caution',
  neutral: 'fn-badge-neutral',
} as const;

/**
 * A status pill. The AI-involvement route says ran / setup / nothing detected
 * with it; the landing page says shipped / scoring shipped / designed. Same
 * three tones, which is what earns it a place in the package.
 */
export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`fn-badge ${TONE[tone]}`}>{children}</span>;
}
