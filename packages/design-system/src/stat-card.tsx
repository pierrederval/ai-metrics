import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="fn-stat-card">
      <span className="fn-stat-card__label">{label}</span>
      <strong className="fn-stat-card__value">{value}</strong>
      {detail !== undefined ? <span className="fn-stat-card__detail">{detail}</span> : null}
    </div>
  );
}
