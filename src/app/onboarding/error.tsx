'use client';
import { Button } from '@fieldnote/design-system';
export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <section className="onboarding-panel">
      <h1>We couldn’t load your repositories.</h1>
      <p>Check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
