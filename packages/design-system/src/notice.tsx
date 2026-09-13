import type { ReactNode } from 'react';

/**
 * The caution callout. `'caution'` is the only tone today — the prop exists
 * so a future tone does not require a signature change.
 */
export function Notice({ children }: { tone?: 'caution'; children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
