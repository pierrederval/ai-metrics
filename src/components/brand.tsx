import Link from 'next/link';
export function Brand({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Fieldnote home">
      <svg className="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 53V30A20 20 0 0 1 34 10H50" />
          <path d="M22 53V30A12 12 0 0 1 34 18H50" />
          <path d="M30 53V30A4 4 0 0 1 34 26H50" />
        </g>
      </svg>
      <span className="brand-name">fieldnote</span>
    </Link>
  );
}
