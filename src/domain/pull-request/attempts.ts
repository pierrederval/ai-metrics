import {
  gateKey,
  isFailure,
  type CiCheck,
  type CiAttempt,
  type GatePolicy,
  type PullRequestFacts,
} from './types';
const time = (c: CiCheck) => c.queuedAt ?? c.startedAt ?? c.completedAt ?? '9999';
export function canonicalChecks(checks: CiCheck[]): CiCheck[] {
  // Observations of an execution are not separate executions. Completed observations win.
  const sorted = [...checks].sort(
    (a, b) =>
      a.id.localeCompare(b.id) ||
      a.execution - b.execution ||
      Number(a.status === 'completed') - Number(b.status === 'completed') ||
      (a.completedAt ?? '').localeCompare(b.completedAt ?? '') ||
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  return [...new Map(sorted.map((c) => [`${c.id}:${c.execution}`, c])).values()].sort(
    (a, b) =>
      time(a).localeCompare(time(b)) || a.execution - b.execution || a.id.localeCompare(b.id),
  );
}
function outcome(checks: CiCheck[], policy: GatePolicy): boolean | null {
  if (checks.some((c) => isFailure(c.conclusion))) return false;
  if (policy.gates.some((g) => !checks.some((c) => gateKey(c) === gateKey(g)))) return null;
  if (checks.some((c) => c.status !== 'completed')) return null;
  return checks.every((c) => c.conclusion === 'success');
}
export function groupChecksIntoAttempts(facts: PullRequestFacts, policy: GatePolicy): CiAttempt[] {
  if (!policy.gates.length) return [];
  const keys = new Set(policy.gates.map(gateKey));
  const checks = canonicalChecks(facts.checks).filter((c) => keys.has(gateKey(c)));
  const shas = [...new Set(checks.map((c) => c.sha))].sort((a, b) => {
    const ar = facts.revisions.find((r) => r.sha === a)?.observedAt;
    const br = facts.revisions.find((r) => r.sha === b)?.observedAt;
    return (
      (ar ?? time(checks.find((c) => c.sha === a)!)).localeCompare(
        br ?? time(checks.find((c) => c.sha === b)!),
      ) || a.localeCompare(b)
    );
  });
  return shas.map((sha, order) => {
    const cs = checks.filter((c) => c.sha === sha),
      initial = new Map<string, CiCheck>();
    for (const c of cs) if (!initial.has(gateKey(c))) initial.set(gateKey(c), c);
    const events = cs
      .flatMap((c) => [
        ...(c.queuedAt || c.startedAt ? [{ at: c.queuedAt ?? c.startedAt!, kind: 0, c }] : []),
        ...(c.completedAt && c.status === 'completed' ? [{ at: c.completedAt, kind: 1, c }] : []),
      ])
      .sort(
        (a, b) =>
          a.at.localeCompare(b.at) ||
          a.kind - b.kind ||
          a.c.execution - b.c.execution ||
          a.c.id.localeCompare(b.c.id),
      );
    const current = new Map<string, { id: string; execution: number; success: boolean }>();
    let greenAt: string | null = null;
    for (const e of events) {
      const key = gateKey(e.c),
        old = current.get(key);
      if (e.kind === 0) current.set(key, { id: e.c.id, execution: e.c.execution, success: false });
      else if (!old || (old.id === e.c.id && old.execution === e.c.execution))
        current.set(key, {
          id: e.c.id,
          execution: e.c.execution,
          success: e.c.conclusion === 'success',
        });
      if (!greenAt && policy.gates.every((g) => current.get(gateKey(g))?.success)) greenAt = e.at;
    }
    const latest = new Map<string, CiCheck>();
    for (const c of cs) latest.set(gateKey(c), c);
    const allSuccess = outcome([...latest.values()], policy);
    return {
      sha,
      order,
      checks: cs,
      greenAt,
      green: greenAt ? true : allSuccess === true ? null : allSuccess,
      firstPass: outcome([...initial.values()], policy),
    };
  });
}
