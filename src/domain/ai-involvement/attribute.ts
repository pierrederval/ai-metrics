import { collectHits, type ExecutedInput } from './detect-executed';
import type { AgentId } from './types';

/** Matches the pull_requests.agent_provider default that has shipped since 0000. */
export const UNATTRIBUTED = 'unknown';

export type Attribution = AgentId | typeof UNATTRIBUTED;

export function attributePullRequests(input: ExecutedInput): Map<string, Attribution> {
  // Every stored pull request gets a key, so a row that lost its evidence is
  // rewritten to UNATTRIBUTED rather than keeping a stale agent.
  const result = new Map<string, Attribution>(
    input.pullRequests.map((row) => [row.id, UNATTRIBUTED as Attribution]),
  );

  // prId -> agent -> count of distinct evidence sources naming that agent.
  const perPr = new Map<string, Map<AgentId, number>>();
  for (const [agent, bySource] of collectHits(input)) {
    for (const [, byValue] of bySource) {
      const prIds = new Set<string>();
      for (const [, hit] of byValue) for (const prId of hit.prIds) prIds.add(prId);
      for (const prId of prIds) {
        const counts = perPr.get(prId) ?? new Map<AgentId, number>();
        counts.set(agent, (counts.get(agent) ?? 0) + 1);
        perPr.set(prId, counts);
      }
    }
  }

  for (const [prId, counts] of perPr) {
    const [top] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    if (top) result.set(prId, top[0]);
  }

  return result;
}
