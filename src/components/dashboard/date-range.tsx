'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { DashboardData, Range } from '../../domain/dashboard/types';
import { rangeEnd } from './range-query';
export function DateRange({
  range,
  bounds,
}: {
  range: Range;
  bounds: DashboardData['collectionBounds'];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const start = range.start.slice(0, 10),
    end = rangeEnd(range);
  const known = bounds.from !== null && bounds.to !== null;
  return (
    <div className="metric-range">
      <p>
        <time>{start}</time> – <time>{end}</time> · UTC
        {end === new Date().toISOString().slice(0, 10) ? ' · Today is partial' : ''}
      </p>
      <nav aria-label="Date range" className="range-presets">
        {[7, 30, 90].map((days) => (
          <Link
            key={days}
            href={`${pathname}?days=${days}`}
            scroll={false}
            aria-current={
              range.days === days && end === new Date().toISOString().slice(0, 10)
                ? 'true'
                : undefined
            }
          >
            Last {days} days
          </Link>
        ))}
      </nav>
      {known ? (
        <details className="custom-range">
          <summary>Custom dates</summary>
          <form
            key={`${start}:${end}:${bounds.from}:${bounds.to}`}
            action={pathname}
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              const from = String(values.get('from')),
                to = String(values.get('to'));
              const input = form.elements.namedItem('to') as HTMLInputElement;
              input.setCustomValidity(from > to ? 'End date must be on or after start date.' : '');
              if (form.reportValidity())
                router.push(`${pathname}?${new URLSearchParams({ from, to })}`, { scroll: false });
            }}
          >
            <label>
              From (UTC)
              <input
                type="date"
                name="from"
                required
                min={bounds.from!}
                max={bounds.to!}
                defaultValue={
                  start < bounds.from! ? bounds.from! : start > bounds.to! ? bounds.to! : start
                }
                onChange={(e) => {
                  const to = e.currentTarget.form?.elements.namedItem(
                    'to',
                  ) as HTMLInputElement | null;
                  to?.setCustomValidity('');
                }}
              />
            </label>
            <label>
              To (UTC)
              <input
                type="date"
                name="to"
                required
                min={bounds.from!}
                max={bounds.to!}
                defaultValue={
                  end > bounds.to! ? bounds.to! : end < bounds.from! ? bounds.from! : end
                }
                onChange={(e) => e.currentTarget.setCustomValidity('')}
              />
            </label>
            <button type="submit">Apply dates</button>
          </form>
          <p className="muted">
            Collected horizon: {bounds.from} – {bounds.to}. Free visibility and incomplete evidence
            may still leave gaps.
          </p>
        </details>
      ) : (
        <p className="muted custom-unavailable">
          Custom dates become available when history discovery establishes the collected date range.
          Presets show the evidence available so far.
        </p>
      )}
    </div>
  );
}
