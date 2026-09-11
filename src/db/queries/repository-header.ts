// Trusted server query. IDs must come from current-request repository authorization.
//
// The layout renders on every tab, so anything only one tab reads belongs in
// that tab's own page.tsx, not here. repositoryRecords() already returns
// every coverage fact the strip states, so the strip needs no query of its
// own — but Settings also needs a RepositoryRecord (for RepositoryMetadata),
// so this module exports the per-request-memoised repositoryRecord() below
// rather than letting each caller run repositoryRecords()'s full
// accessible-PR-history join separately.
import { cache } from 'react';
import { isActiveImport } from '../../domain/import/progress';
import type { ImportSnapshot, ImportState } from '../../domain/import/types';
import { repositoryRecords, type RepositoryRecord } from './repository-records';

/**
 * Per-request memoised single-repository lookup. repositoryRecords() runs a
 * full accessible-PR-history join and takes a batch of ids (used as a batch
 * by the /repos listing) — array arguments defeat React's cache() because it
 * memoises on argument identity, and a fresh array literal at each call site
 * would never compare equal. This wrapper takes a plain string so two
 * callers within the same request (the layout's coverage strip and
 * Settings' RepositoryMetadata) share one execution instead of running the
 * join twice. Both callers MUST go through this wrapper, not
 * repositoryRecords() directly, or the dedupe silently doesn't happen.
 */
export const repositoryRecord = cache(
  async (repositoryId: string) => (await repositoryRecords([repositoryId]))[0],
);

/** What the coverage strip states, in one line, above every number it qualifies. */
export interface CoverageFacts {
  reviewDetected: boolean;
  ciDetected: boolean;
  lastSuccessfulFetch: { at: string; source: string } | null;
  /** Background history backfill status; 'complete' means history is current. */
  historyState: string;
}

export interface RepositoryHeader {
  record: RepositoryRecord;
  coverage: CoverageFacts;
  /** Non-null only while collection is running — the "do not trust these numbers yet" case. */
  activeImport: ImportSnapshot | null;
  /**
   * Raw state of the latest import run, in flight or not. The header gates
   * Refresh on it (canRefreshImport) and the strip reports a failed or partial
   * run, which is as much a "do not trust these numbers yet" condition as an
   * import still running.
   */
  latestImportState: ImportState | null;
}

/**
 * Pure composition, no I/O: turns an already-fetched record and import
 * snapshot into the shape RepositoryPageHeader renders. Split out from the
 * query so the layout can fetch record and latest itself (via the shared
 * repositoryRecord/latestImport calls Settings also uses) rather than going
 * through a second wrapper function — same data, one obvious call site per
 * query per request.
 */
export function composeRepositoryHeader(
  record: RepositoryRecord,
  latest: ImportSnapshot | null,
): RepositoryHeader {
  return {
    record,
    coverage: {
      reviewDetected: record.reviewDetected,
      ciDetected: record.ciDetected,
      lastSuccessfulFetch: record.lastSuccessfulFetch,
      historyState: record.historyState,
    },
    activeImport: latest && isActiveImport(latest.state) ? latest : null,
    latestImportState: latest?.state ?? null,
  };
}
