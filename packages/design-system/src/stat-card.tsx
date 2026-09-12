import type { ReactNode } from 'react';

/**
 * A label, a figure and an optional line of detail. The `.t` / `.v` / `.s`
 * child class names are the ones six existing call sites already render, kept
 * so this component and that markup cannot drift apart.
 */
export function StatCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  const classes = ['fn-stat-card', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <span className="t">{label}</span>
      <span className="v">{value}</span>
      {detail ? <span className="s">{detail}</span> : null}
    </div>
  );
}
