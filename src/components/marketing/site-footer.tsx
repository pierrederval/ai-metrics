export function SiteFooter() {
  return (
    <footer className="mk-footer">
      <p className="mk-footer-line">
        <strong>fieldnote</strong> · Evidence-first analytics for AI-written pull requests.
      </p>
      <nav className="mk-footer-links" aria-label="Footer">
        <a href="https://github.com/pierrederval/ai-metrics">Source</a>
        <a href="https://github.com/pierrederval/ai-metrics#readme">Documentation</a>
        <a href="https://github.com/pierrederval/ai-metrics/blob/main/LICENSE">AGPL-3.0</a>
        <a href="/api/auth/login">Sign in</a>
      </nav>
    </footer>
  );
}
