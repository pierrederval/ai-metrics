'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();
  const signedOut = pathname === '/signed-out';
  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard" aria-label="Fieldnote home">
        <svg className="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 53V30A20 20 0 0 1 34 10H50" />
            <path d="M22 53V30A12 12 0 0 1 34 18H50" />
            <path d="M30 53V30A4 4 0 0 1 34 26H50" />
          </g>
        </svg>
        <span className="brand-name">fieldnote</span>
        <span className="brand-caption">Engineering records</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined}>
          <span className="nav-number">01</span> Overview
        </Link>
        <Link
          href="/dashboard#repositories"
          aria-current={pathname.startsWith('/repos/') ? 'page' : undefined}
        >
          <span className="nav-number">02</span> Repositories
        </Link>
      </nav>
      <div className="sidebar-footer">
        <span className="connection-label">GitHub · PR & CI evidence</span>
        <p>Good work compounds.</p>
        {signedOut ? (
          <Link href="/api/auth/login">Sign in with GitHub ↗</Link>
        ) : (
          <form action="/api/auth/logout" method="post">
            <button className="quiet-button">Sign out</button>
          </form>
        )}
      </div>
    </aside>
  );
}
