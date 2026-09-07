import { Sidebar } from '../components/sidebar';
import './style.css';
export const metadata = {
  title: { default: 'Fieldnote — Engineering records', template: '%s · Fieldnote' },
  description:
    'Evidence-first engineering reliability. Follow pull requests, CI attempts, and the work behind green.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="app-shell">
          <Sidebar />
          <main id="main-content" tabIndex={-1}>
            <div className="page-topline">
              <span>Engineering reliability</span>
              <span>Evidence first</span>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
