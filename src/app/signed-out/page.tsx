import { Brand } from '../../components/brand';
export const metadata = { title: 'Sign in' };
export default function SignedOut() {
  return (
    <main id="main-content" className="public-entry" tabIndex={-1}>
      <div className="signin-panel">
        <Brand href="/signed-out" />
        <h1 className="sr-only">Sign in</h1>
        <p>Sign in to your engineering workspace.</p>
        <a className="signin-github" href="/api/auth/login">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6A4.7 4.7 0 0 1 5.6 8.6c-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 5 18.3 5.3 18.3 5.3c.6 1.7.2 3 .1 3.3a4.7 4.7 0 0 1 1.2 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
          </svg>
          Continue with GitHub
        </a>
        <p className="fine">
          New here? Your personal workspace is created automatically.
          <br />
          You can invite your team as soon as you’re in.
        </p>
        <hr />
        <p className="fine">
          Have a workspace invitation? Sign in with the GitHub account whose verified email matches
          your invitation.
        </p>
      </div>
    </main>
  );
}
