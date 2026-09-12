// The package first, so its layers are established before the app's own
// unlayered rules — which then win over anything in fn.* without having to
// escalate specificity to do it.
import '@fieldnote/design-system/styles';
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
        {children}
      </body>
    </html>
  );
}
