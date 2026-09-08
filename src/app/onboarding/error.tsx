'use client';
export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <section className="onboarding-panel">
      <h1>We couldn’t load your repositories.</h1>
      <p>Check your connection and try again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
