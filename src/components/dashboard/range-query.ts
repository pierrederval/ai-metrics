import { resolveRange, UTC_DAY_MS } from '../../domain/dashboard/range';
import type { Range } from '../../domain/dashboard/types';
export type RangeSearch = { [key: string]: string | string[] | undefined };
export type RangePageProps = { searchParams?: Promise<RangeSearch> };
export function readRange(search: RangeSearch, now = new Date()) {
  for (const name of ['days', 'from', 'to']) {
    if (Array.isArray(search[name])) throw new Error('Use one value per date parameter');
  }
  return resolveRange(
    {
      days: search.days === undefined ? undefined : Number(search.days),
      from: search.from as string | undefined,
      to: search.to as string | undefined,
    },
    now,
  );
}
export function rangeQuery(range: Range, search: RangeSearch): string {
  const query =
    search.from !== undefined || search.to !== undefined
      ? new URLSearchParams({ from: range.start.slice(0, 10), to: rangeEnd(range) })
      : new URLSearchParams({ days: String(range.days) });
  return `?${query}`;
}
export function rangeEnd(range: Range) {
  return new Date(Date.parse(range.endExclusive) - UTC_DAY_MS).toISOString().slice(0, 10);
}
