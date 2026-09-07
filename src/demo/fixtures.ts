import type { CiCheck, Conclusion, PullRequestFacts } from '../domain/pull-request/types';
export const demoPolicy = {
  version: 1,
  gates: [
    { appId: '15368', name: 'unit' },
    { appId: '15368', name: 'playwright' },
  ],
};
export function demoFacts(index: number): PullRequestFacts {
  const time = (minute: number) => new Date(Date.UTC(2026, 8, index + 1, 9, minute)).toISOString();
  const kind = index % 7,
    count = kind === 0 ? 1 : kind === 2 ? 3 : 2;
  const checks: CiCheck[] = [],
    revisions: PullRequestFacts['revisions'] = [];
  for (let i = 0; i < count; i++) {
    const sha = `demo-${index}-${i}`;
    revisions.push({
      sha,
      previousSha: i ? `demo-${index}-${i - 1}` : null,
      observedAt: time(i * 10),
      files: i
        ? [
            {
              path: kind === 3 ? 'tests/checkout.spec.ts' : 'src/checkout.ts',
              changeType: 'modified',
              additions: 3,
              deletions: 1,
            },
          ]
        : [],
      diffComplete: true,
    });
    for (const gate of demoPolicy.gates) {
      let conclusion: Conclusion | null =
        i === count - 1 && kind !== 4
          ? 'success'
          : gate.name === (index % 2 ? 'unit' : 'playwright')
            ? 'failure'
            : 'success';
      if (kind === 5 && i === count - 1) conclusion = null;
      checks.push({
        id: `${sha}-${gate.name}`,
        sha,
        ...gate,
        execution: 1,
        status: conclusion ? 'completed' : 'in_progress',
        conclusion,
        queuedAt: time(i * 10 + 1),
        startedAt: time(i * 10 + 1),
        completedAt: conclusion ? time(i * 10 + 4) : null,
      });
    }
  }
  if (kind === 6) {
    const failed = checks.find((c) => c.conclusion === 'failure')!;
    checks.push({
      ...failed,
      id: `${failed.id}-rerun`,
      execution: 2,
      conclusion: 'success',
      queuedAt: time(5),
      startedAt: time(5),
      completedAt: time(8),
    });
  }
  return {
    openedAt: time(0),
    mergedAt: kind < 4 ? time(30) : null,
    closedAt: kind === 5 ? null : time(30),
    checks,
    revisions,
    files: [
      { path: 'src/checkout.ts', changeType: 'modified', additions: 10, deletions: 4 },
      ...revisions.flatMap((r) => r.files),
    ],
    historyComplete: index !== 19,
    issues: index === 19 ? ['Historical revision chronology unavailable'] : [],
  };
}
