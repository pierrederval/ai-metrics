import { isFailure, type CiAttempt, type PullRequestFacts } from '../pull-request/types';
import { isHarnessFile } from './classify-file';
export function detectHarnessChangedAfterFailure(
  facts: PullRequestFacts,
  attempts: CiAttempt[],
  greenAt: string | null,
): boolean | null {
  const failures = attempts.flatMap((a) => a.checks).filter((c) => isFailure(c.conclusion));
  if (!failures.length) return facts.historyComplete ? false : null;
  let unknown = !facts.historyComplete;
  for (const failed of failures) {
    if (!failed.completedAt) {
      unknown = true;
      continue;
    }
    if (greenAt && failed.completedAt >= greenAt) continue;
    for (const revision of facts.revisions) {
      if (revision.sha === failed.sha) continue;
      if (!revision.observedAt) {
        unknown = true;
        continue;
      }
      if (revision.observedAt <= failed.completedAt || (greenAt && revision.observedAt > greenAt))
        continue;
      if (!revision.previousSha || !revision.diffComplete) {
        unknown = true;
        continue;
      }
      if (
        revision.files.some(
          (f) => isHarnessFile(f.path) || (f.previousPath && isHarnessFile(f.previousPath)),
        )
      )
        return true;
    }
  }
  return unknown ? null : false;
}
