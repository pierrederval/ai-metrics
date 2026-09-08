'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { WorkspaceSwitcher } from './workspace-switcher';
type Workspace = { id: string; name: string; role: 'owner' | 'member' };
export function Sidebar({
  active,
  workspaces,
  demo,
}: {
  active: Workspace;
  workspaces: Workspace[];
  demo: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Brand />
      <WorkspaceSwitcher active={active} workspaces={workspaces} demo={demo} />
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
      </div>
    </aside>
  );
}
