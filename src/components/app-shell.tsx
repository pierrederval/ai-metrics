import { currentUser } from '../auth/session';
import { requireWorkspace } from '../workspaces/access';
import { listWorkspaces } from '../workspaces/store';
import { env } from '../lib/env';
import { Sidebar } from './sidebar';
import { AccountMenu } from './account-menu';
export async function AppShell({ children }: { children: React.ReactNode }) {
  const active = await requireWorkspace();
  const demo = env().DEMO_MODE === 'true';
  const user = demo ? { displayName: 'Demo visitor', login: 'demo' } : await currentUser();
  const choices = demo ? [active] : await listWorkspaces((await currentUser()).id);
  return (
    <div className="app-shell">
      <Sidebar active={active} workspaces={choices} demo={demo} />
      <main id="main-content" tabIndex={-1}>
        <div className="page-topline">
          <span>{active.name} / Engineering records</span>
          <AccountMenu
            name={user.displayName ?? user.login}
            workspace={active.name}
            role={active.role}
            demo={demo}
          />
        </div>
        {children}
      </main>
    </div>
  );
}
