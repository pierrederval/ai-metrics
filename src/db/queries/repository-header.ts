// Trusted server query. IDs must come from current-request repository authorization.
//
// This is the whole data cost of the persistent repository header, and it is
// deliberately small: the layout renders on every tab, so anything only one tab
// reads belongs in that tab's own page.tsx, not here. repositoryRecords()
// already returns every coverage fact the strip states, so the strip needs no
// query of its own.
import { isActiveImport } from '../../domain/import/progress';
import type { ImportSnapshot } from '../../domain/import/types';
import { latestImport } from './repository-imports';
import { repositoryRecords, type RepositoryRecord } from './repository-records';

/** What the coverage strip states, in one line, above every number it qualifies. */
export interface CoverageFacts {
  reviewDetected: boolean;
  ciDetected: boolean;
  lastSuccessfulFetch: { at: string; source: string } | null;
  /** Latest 100 import state, for the case where no import is currently in flight. */
  importState: string;
  /** Background history backfill status; 'complete' means history is current. */
  historyState: string;
}

export interface RepositoryHeader {
  record: RepositoryRecord;
  coverage: CoverageFacts;
  /** Non-null only while collection is running — the "do not trust these numbers yet" case. */
  activeImport: ImportSnapshot | null;
}

export async function loadRepositoryHeader(repositoryId: string): Promise<RepositoryHeader> {
  const [[record], latest] = await Promise.all([
    repositoryRecords([repositoryId]),
    latestImport(repositoryId),
  ]);
  return {
    record,
    coverage: {
      reviewDetected: record.reviewDetected,
      ciDetected: record.ciDetected,
      lastSuccessfulFetch: record.lastSuccessfulFetch,
      importState: record.importState,
      historyState: record.historyState,
    },
    activeImport: latest && isActiveImport(latest.state) ? latest : null,
  };
}
