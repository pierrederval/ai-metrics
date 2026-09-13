import { Brand } from '@fieldnote/design-system';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="public-entry" tabIndex={-1}>
      <div className="signin-panel">
        <Brand href="/signed-out" />
        {children}
      </div>
    </main>
  );
}
