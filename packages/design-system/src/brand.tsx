import type { ComponentType, ReactNode } from 'react';

type LinkLike = ComponentType<{
  className?: string;
  href: string;
  'aria-label'?: string;
  children?: ReactNode;
}>;

/**
 * The Field Lines seal and the wordmark.
 *
 * The package cannot import `next/link` — it imports no framework at all — but
 * the app's sidebar logo should still navigate client-side. So the link
 * component is injected: the app passes `as={Link}`, the landing page passes
 * nothing and gets a plain `<a>`. That keeps the boundary intact without
 * turning every logo click in the product into a full page load.
 */
export function Brand({
  as: Link = 'a',
  href = '/',
  caption,
}: {
  as?: LinkLike | 'a';
  href?: string;
  caption?: ReactNode;
}) {
  const content = (
    <>
      <svg className="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 53V30A20 20 0 0 1 34 10H50" />
          <path d="M22 53V30A12 12 0 0 1 34 18H50" />
          <path d="M30 53V30A4 4 0 0 1 34 26H50" />
        </g>
      </svg>
      <span className="brand-name">fieldnote</span>
      {caption ? <span className="brand-caption">{caption}</span> : null}
    </>
  );
  return Link === 'a' ? (
    <a className="brand" href={href} aria-label="Fieldnote home">
      {content}
    </a>
  ) : (
    <Link className="brand" href={href} aria-label="Fieldnote home">
      {content}
    </Link>
  );
}
