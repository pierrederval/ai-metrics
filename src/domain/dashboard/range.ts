import type { Range } from './types';
export const UTC_DAY_MS = 86_400_000;
function calendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use YYYY-MM-DD dates');
  const result = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value)
    throw new Error('Invalid calendar date');
  return result;
}
/** Custom from/to dates are inclusive. Presets include the current UTC day. */
export function resolveRange(
  input: { days?: number; from?: string; to?: string },
  now: Date,
): Range {
  const today = calendarDate(now.toISOString().slice(0, 10));
  let start: number, end: number;
  if (input.from !== undefined || input.to !== undefined) {
    if (!input.from || !input.to) throw new Error('Both dates are required');
    start = calendarDate(input.from);
    end = calendarDate(input.to);
    if (start > end || end > today) throw new Error('Invalid date order or future range');
    end += UTC_DAY_MS;
  } else {
    const days = input.days ?? 7;
    if (![7, 30, 90].includes(days)) throw new Error('Unsupported preset');
    end = today + UTC_DAY_MS;
    start = end - days * UTC_DAY_MS;
  }
  // Bound work even when a URL bypasses the history-aware picker.
  if ((end - start) / UTC_DAY_MS > 3660) throw new Error('Range exceeds ten years');
  return {
    start: new Date(start).toISOString(),
    endExclusive: new Date(end).toISOString(),
    days: (end - start) / UTC_DAY_MS,
  };
}
export function previousRange(range: Range): Range {
  return {
    start: new Date(Date.parse(range.start) - range.days * UTC_DAY_MS).toISOString(),
    endExclusive: range.start,
    days: range.days,
  };
}
