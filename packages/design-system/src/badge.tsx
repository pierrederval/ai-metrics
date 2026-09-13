import type { ReactNode } from 'react';

export type BadgeTone = 'positive' | 'caution' | 'neutral';

const toneClassName: Record<BadgeTone, string> = {
  positive: 'fn-badge--positive',
  caution: 'fn-badge--caution',
  neutral: 'fn-badge--neutral',
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`fn-badge ${toneClassName[tone]}`}>{children}</span>;
}
