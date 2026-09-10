import type { AgentId, AgentMarker, Detection, EvidenceSource } from './types';
import { catalogue } from './catalogue';

export interface PullRequestRow {
  id: string;
  authorLogin: string;
  headRef: string | null;
  markers: AgentMarker[];
  occurredAt: string;
}

export interface CheckRow {
  pullRequestId: string;
  appId: string;
  occurredAt: string | null;
}

export interface CommitRow {
  pullRequestId: string;
  authorLogin: string | null;
  occurredAt: string | null;
}

export interface ReviewRow {
  pullRequestId: string;
  reviewerId: string;
  occurredAt: string | null;
}

export interface ExecutedInput {
  pullRequests: PullRequestRow[];
  checks: CheckRow[];
  commits: CommitRow[];
  reviews: ReviewRow[];
}

interface Hit {
  prIds: Set<string>;
  first: string | null;
  last: string | null;
}

// Map: agent -> evidence source -> evidence value -> accumulated hit.
// Keeping source/value as real map keys (rather than a concatenated string)
// avoids ever needing to cast a plain string back to EvidenceSource.
type AgentHits = Map<AgentId, Map<EvidenceSource, Map<string, Hit>>>;

export type { AgentHits };

function note(
  hits: AgentHits,
  agent: AgentId,
  source: EvidenceSource,
  value: string,
  prId: string,
  at: string | null,
): void {
  const bySource = hits.get(agent) ?? new Map<EvidenceSource, Map<string, Hit>>();
  const byValue = bySource.get(source) ?? new Map<string, Hit>();
  const hit = byValue.get(value) ?? { prIds: new Set<string>(), first: null, last: null };
  hit.prIds.add(prId);
  if (at && (!hit.first || at < hit.first)) hit.first = at;
  if (at && (!hit.last || at > hit.last)) hit.last = at;
  byValue.set(value, hit);
  bySource.set(source, byValue);
  hits.set(agent, bySource);
}

/** Finds the catalogue value that matches `observed`, comparing case-insensitively. */
function matchCatalogueLogin(values: readonly string[], observed: string): string | undefined {
  const lower = observed.toLowerCase();
  return values.find((value) => value.toLowerCase() === lower);
}

/** The evidence walk shared by detectExecuted and attributePullRequests. */
export function collectHits(input: ExecutedInput): AgentHits {
  // Rows referencing a pull request absent from input.pullRequests are discarded
  // first, so a stale row can never inflate a count.
  const prIds = new Set(input.pullRequests.map((row) => row.id));
  const checks = input.checks.filter((row) => prIds.has(row.pullRequestId));
  const commits = input.commits.filter((row) => prIds.has(row.pullRequestId));
  const reviews = input.reviews.filter((row) => prIds.has(row.pullRequestId));

  const hits: AgentHits = new Map();

  for (const row of input.pullRequests) {
    const headRef = row.headRef?.toLowerCase() ?? null;
    for (const entry of catalogue) {
      const prefix = headRef ? entry.branchPrefixes.find((p) => headRef.startsWith(p)) : undefined;
      if (prefix) note(hits, entry.agent, 'branch-prefix', prefix, row.id, row.occurredAt);

      const authorMatch = matchCatalogueLogin(entry.botLogins, row.authorLogin);
      if (authorMatch) note(hits, entry.agent, 'pr-author', authorMatch, row.id, row.occurredAt);
    }
    for (const marker of row.markers) {
      // Markers carry an already-matched signal, not raw commit/body text; we
      // never emit that text, so collapse it to a stable, generic value.
      const value = marker.ref === 'body' ? 'body' : 'commit';
      note(hits, marker.agent, marker.source, value, row.id, row.occurredAt);
    }
  }

  for (const row of checks) {
    for (const entry of catalogue) {
      const appMatch = entry.checkAppIds.find((appId) => appId === row.appId);
      if (appMatch) note(hits, entry.agent, 'check-app', appMatch, row.pullRequestId, row.occurredAt);
    }
  }

  for (const row of commits) {
    if (!row.authorLogin) continue;
    for (const entry of catalogue) {
      const authorMatch = matchCatalogueLogin(entry.botLogins, row.authorLogin);
      if (authorMatch) note(hits, entry.agent, 'commit-author', authorMatch, row.pullRequestId, row.occurredAt);
    }
  }

  for (const row of reviews) {
    for (const entry of catalogue) {
      const reviewerMatch = matchCatalogueLogin(entry.reviewerIds, row.reviewerId);
      if (reviewerMatch)
        note(hits, entry.agent, 'review-author', reviewerMatch, row.pullRequestId, row.occurredAt);
    }
  }

  return hits;
}

export function detectExecuted(input: ExecutedInput): Detection[] {
  const hits = collectHits(input);

  const detections: Detection[] = [...hits.entries()]
    .map((entry): Detection | null => {
      const [agent, bySource] = entry;
      // Agent ids are persisted in pull_requests.agent_markers and outlive the
      // code that wrote them: a catalogue entry can be renamed or removed while
      // old rows still carry it. Skip rather than throw so stale evidence never
      // fails a whole repository's recompute.
      const catalogueEntry = catalogue.find((candidate) => candidate.agent === agent);
      if (!catalogueEntry) {
        console.warn(`Unknown agent in hits; skipping: ${agent}`);
        return null;
      }

      const entries: Array<{ source: EvidenceSource; value: string; hit: Hit }> = [];
      for (const [source, byValue] of bySource) {
        for (const [value, hit] of byValue) {
          entries.push({ source, value, hit });
        }
      }
      entries.sort((a, b) => a.source.localeCompare(b.source) || a.value.localeCompare(b.value));

      // occurrences is the size of the UNION of pull-request ids across all of
      // this agent's evidence, never the sum of per-evidence counts.
      const allPrIds = new Set(entries.flatMap(({ hit }) => [...hit.prIds]));
      const times = entries
        .flatMap(({ hit }) => [hit.first, hit.last])
        .filter((t): t is string => t !== null);

      return {
        agent,
        kind: catalogueEntry.kind,
        signal: 'executed',
        firstSeenAt: times.length ? times.reduce((a, b) => (a < b ? a : b)) : null,
        lastSeenAt: times.length ? times.reduce((a, b) => (a > b ? a : b)) : null,
        occurrences: allPrIds.size,
        evidence: entries.map(({ source, value, hit }) => ({
          source,
          value,
          prCount: hit.prIds.size,
        })),
      };
    })
    .filter((detection): detection is Detection => detection !== null);

  return detections.sort(
    (a, b) => (b.occurrences ?? 0) - (a.occurrences ?? 0) || a.agent.localeCompare(b.agent),
  );
}
