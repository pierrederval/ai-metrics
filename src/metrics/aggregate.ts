import { canonicalChecks } from '../domain/pull-request/attempts';
import {
  gateKey,
  isFailure,
  type GatePolicy,
  type PrMetrics,
  type PullRequestFacts,
} from '../domain/pull-request/types';
export function percentage(values: (boolean | null)[]) {
  const known = values.filter((v) => v !== null);
  return {
    value: known.length ? (100 * known.filter(Boolean).length) / known.length : null,
    known: known.length,
    unknown: values.length - known.length,
  };
}
export function aggregate(metrics: PrMetrics[]) {
  const attempts = metrics.flatMap((m) =>
    m.eventuallyGreen === true && m.attemptsToGreen !== null ? [m.attemptsToGreen] : [],
  );
  const times = metrics
    .flatMap((m) => (m.timeToFirstGreenSeconds === null ? [] : [m.timeToFirstGreenSeconds]))
    .sort((a, b) => a - b);
  return {
    firstPass: percentage(metrics.map((m) => m.firstPassGreen)),
    eventually: percentage(metrics.map((m) => m.eventuallyGreen)),
    mutation: percentage(metrics.map((m) => m.harnessChangedAfterFailure)),
    clean: percentage(metrics.map((m) => m.cleanGreen)),
    averageAttempts: attempts.length ? attempts.reduce((a, b) => a + b, 0) / attempts.length : null,
    medianTime: times.length
      ? (times[Math.floor(times.length / 2)] + times[Math.floor((times.length - 1) / 2)]) / 2
      : null,
  };
}
export function failureBreakdown(
  prs: { id: string; facts: PullRequestFacts }[],
  policy: GatePolicy,
) {
  const gates = new Set(policy.gates.map(gateKey));
  const results = new Map<
    string,
    { checkName: string; appId: string; failureCount: number; total: number; prs: Set<string> }
  >();
  for (const pr of prs)
    for (const c of canonicalChecks(pr.facts.checks)) {
      if (
        !gates.has(gateKey(c)) ||
        c.status !== 'completed' ||
        !c.conclusion ||
        ['neutral', 'skipped'].includes(c.conclusion)
      )
        continue;
      const entry = results.get(gateKey(c)) ?? {
        checkName: c.name,
        appId: c.appId,
        failureCount: 0,
        total: 0,
        prs: new Set<string>(),
      };
      entry.total++;
      if (isFailure(c.conclusion)) {
        entry.failureCount++;
        entry.prs.add(pr.id);
      }
      results.set(gateKey(c), entry);
    }
  return [...results.values()]
    .map((r) => ({
      checkName: r.checkName,
      appId: r.appId,
      failureCount: r.failureCount,
      affectedPrCount: r.prs.size,
      failureRate: r.failureCount / r.total,
      total: r.total,
    }))
    .sort((a, b) => b.failureCount - a.failureCount || a.checkName.localeCompare(b.checkName));
}
