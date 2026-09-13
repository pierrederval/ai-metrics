import { redirect } from 'next/navigation';
import { hasCurrentSession } from '../auth/session';
import { SiteNav } from '../components/marketing/site-nav';
import { Hero } from '../components/marketing/hero';
import { TierLadder } from '../components/marketing/tier-ladder';
import { RubricGrid } from '../components/marketing/rubric-grid';
import { LoopStages } from '../components/marketing/loop-stages';
import { MetricTable } from '../components/marketing/metric-table';
import { Guarantees } from '../components/marketing/guarantees';
import { Signup } from '../components/marketing/signup';
import { SiteFooter } from '../components/marketing/site-footer';
import '../components/marketing/marketing.css';

export const metadata = {
  title: 'Get your ultimate harness',
  description:
    'Agent readiness, graded out of 100. fieldnote scores the repository your coding agents work in, across five deterministic checks with file and line evidence — no LLM judges.',
};

/**
 * The public landing page, and the third public surface alongside /signed-out
 * and /invitations/[token].
 *
 * No (app) route group is needed for this. The root layout is thin — html,
 * body, the skip link and the stylesheet import — and the app shell is applied
 * per section, in dashboard/, repos/, prs/, settings/ and onboarding/. So this
 * page sits at / with its own <main> and every existing route is untouched.
 *
 * That <main id="main-content"> is required rather than decorative: the root
 * layout renders a skip link pointing at it, and this page supplies no
 * AppShell to provide one.
 */
export default async function Landing() {
  if (await hasCurrentSession()) redirect('/dashboard');
  return (
    <main id="main-content" className="mk-page" tabIndex={-1}>
      <div className="mk-shell">
        <SiteNav />
        <Hero />
        <TierLadder />
        <RubricGrid />
        <LoopStages />
        <MetricTable />
        <Guarantees />
        <Signup />
        <SiteFooter />
      </div>
    </main>
  );
}
