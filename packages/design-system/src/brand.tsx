import type { ReactNode } from 'react';

/**
 * The Fieldnote seal + wordmark, linking home. A plain `<a>` — the package
 * cannot import `next/link` (see boundary.test.ts) — so callers that need
 * client-side navigation wrap it themselves.
 *
 * `size` defaults to `'display'`, the stacked marketing lockup. `'compact'`
 * is the one-row sidebar lockup: it emits the extra `fn-brand--compact`
 * class, styled in components.css, and `Sidebar` renders `<Brand
 * size="compact" />`.
 */
export function Brand({
  href = '/dashboard',
  size = 'display',
  children,
}: {
  href?: string;
  size?: 'compact' | 'display';
  children?: ReactNode;
}) {
  return (
    <a
      className={size === 'compact' ? 'fn-brand fn-brand--compact' : 'fn-brand'}
      href={href}
      aria-label="Fieldnote home"
    >
      <svg className="fn-brand__mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 53V30A20 20 0 0 1 34 10H50" />
          <path d="M22 53V30A12 12 0 0 1 34 18H50" />
          <path d="M30 53V30A4 4 0 0 1 34 26H50" />
        </g>
      </svg>
      <span className="fn-brand__word">{children ?? 'fieldnote'}</span>
    </a>
  );
}
