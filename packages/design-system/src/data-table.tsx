import type { ReactNode } from 'react';

/**
 * The horizontal-scroll wrapper a wide table needs. A table is the one element
 * allowed to scroll sideways inside a page whose body must not, so this is the
 * seam that keeps that promise in one place rather than in every caller.
 */
export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  const classes = ['fn-data-table', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
