import type { ReactNode } from 'react';

/**
 * An amber-bordered aside. One tone today; the prop exists so that adding a
 * second does not mean revisiting every call site.
 */
export function Notice({ tone = 'caution', children }: { tone?: 'caution'; children: ReactNode }) {
  return <p className={`fn-notice fn-notice-${tone}`}>{children}</p>;
}
