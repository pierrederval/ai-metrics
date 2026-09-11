import 'dotenv/config';
import { db, closeDb } from '../src/db';
import { installations, repositories, gatePolicies } from '../src/db/schema';
import { persistPr } from '../src/db/queries/persist-pr';
import { demoFacts, demoPolicy } from '../src/demo/fixtures';
import { recomputeExecutedDetections } from '../src/db/queries/ai-involvement';
import type { AgentMarker } from '../src/domain/ai-involvement/types';
if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true')
  throw new Error('Seed requires explicit local DEMO_MODE=true');
try {
  await db()
    .insert(installations)
    .values({
      id: 'demo-installation',
      githubInstallationId: 'demo',
      accountLogin: 'demo',
      accountType: 'Organization',
    })
    .onConflictDoNothing();
  await db()
    .insert(repositories)
    .values({
      id: 'demo-repository',
      installationId: 'demo-installation',
      githubRepositoryId: 'demo',
      owner: 'demo',
      name: 'checkout-service',
      defaultBranch: 'main',
      isPrivate: false,
      isDemo: true,
    })
    .onConflictDoNothing();
  await db()
    .insert(gatePolicies)
    .values({ repositoryId: 'demo-repository', ...demoPolicy })
    .onConflictDoNothing();
  // Every fourth pull request carries a different kind of agent evidence, so the
  // seeded demo exercises branch prefixes, commit trailers, pull-request bodies,
  // and the no-agent case. Claude Code appears through two signals on the same
  // pull requests, which is what makes occurrences a union rather than a sum.
  const agentEvidence = (index: number, sha: string) => {
    const slug = ['checkout-validation', 'payment-retry', 'inventory-race'][index % 3];
    if (index % 4 === 0) return { headRef: `codex/${slug}`, agentMarkers: [] as AgentMarker[] };
    if (index % 4 === 1)
      return {
        headRef: `claude/${slug}`,
        agentMarkers: [
          { agent: 'claude-code', source: 'commit-trailer', ref: sha },
          { agent: 'claude-code', source: 'pr-body', ref: 'body' },
        ] as AgentMarker[],
      };
    if (index % 4 === 2) return { headRef: `copilot/${slug}`, agentMarkers: [] as AgentMarker[] };
    return { headRef: `feature/${slug}`, agentMarkers: [] as AgentMarker[] };
  };
  for (let index = 0; index < 21; index++) {
    const facts = demoFacts(index);
    await persistPr({
      id: `demo-pr-${index + 1}`,
      repositoryId: 'demo-repository',
      githubPrId: `demo-${index + 1}`,
      githubPrNumber: index + 1,
      title: [
        'Add checkout validation',
        'Repair payment retry',
        'Handle inventory race',
        'Update checkout harness',
        'Investigate flaky checkout',
        'Pending CI execution',
        'Rerun unit gate',
      ][index % 7],
      state: facts.closedAt ? 'closed' : 'open',
      authorLogin: index % 2 ? 'alex' : 'sam',
      headSha: facts.revisions.at(-1)!.sha,
      baseSha: 'demo-base',
      openedAt: new Date(facts.openedAt),
      mergedAt: facts.mergedAt ? new Date(facts.mergedAt) : null,
      closedAt: facts.closedAt ? new Date(facts.closedAt) : null,
      sourceUpdatedAt: new Date('2026-09-30T00:00:00Z'),
      facts,
      ...agentEvidence(index, facts.revisions.at(-1)!.sha),
    });
  }
  // Production recomputes on import, backfill and webhook sync; the seed has none
  // of those, so it calls the same function directly.
  await recomputeExecutedDetections('demo-repository');
  console.log('Seeded 21 PRs. Demo signal: /prs/demo-pr-4');
  console.log('AI involvement: /repos/demo-repository/ai-involvement');
} finally {
  await closeDb();
}
