import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { resolveRange } from '../../domain/dashboard/range';
import { DateRange } from './date-range';

vi.mock('next/navigation', () => ({
  usePathname: () => '/repos/repository:1360100266',
  useRouter: () => ({ push: vi.fn() }),
}));
// Expose the Link scheduling contract alongside its real navigation target.
vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch,
    children,
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
  }) =>
    createElement(
      'a',
      { href, 'data-prefetch': prefetch === false ? 'off' : 'automatic' },
      children,
    ),
}));

test('date navigation uses canonical encoded paths while retaining normal prefetch', () => {
  const html = renderToStaticMarkup(
    createElement(DateRange, {
      range: resolveRange({ days: 30 }, new Date('2026-09-08T12:00:00Z')),
      bounds: { from: '2025-09-08', to: '2026-09-08', source: 'backfill-discovery' },
    }),
  );
  expect(html.match(/data-prefetch="automatic"/g)).toHaveLength(3);
  expect(html).toContain('action="/repos/repository%3A1360100266"');
  for (const days of [7, 30, 90]) {
    expect(html).toContain(`href="/repos/repository%3A1360100266?days=${days}"`);
    expect(html).toContain(`Last ${days} days`);
  }
});
