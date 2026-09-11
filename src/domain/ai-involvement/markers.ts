import { catalogue } from './catalogue';
import type { AgentId, AgentMarker, MarkerSource } from './types';

const dedupe = (agents: AgentId[], source: MarkerSource, ref: string): AgentMarker[] =>
  [...new Set(agents)].map((agent) => ({ agent, source, ref }));

export function matchCommitTrailers(sha: string, message: string): AgentMarker[] {
  const haystack = message.toLowerCase();
  const agents = catalogue
    .filter((entry) => entry.trailerPatterns.some((pattern) => haystack.includes(pattern)))
    .map((entry) => entry.agent);
  return dedupe(agents, 'commit-trailer', sha);
}

export function matchPullRequestBody(body: string | null): AgentMarker[] {
  if (!body) return [];
  const haystack = body.toLowerCase();
  const agents = catalogue
    .filter((entry) => entry.bodyPatterns.some((pattern) => haystack.includes(pattern)))
    .map((entry) => entry.agent);
  return dedupe(agents, 'pr-body', 'body');
}
