import { classifyHarnessFile, isHarnessFile } from '../domain/harness/classify-file';
import { detectHarnessChangedAfterFailure } from '../domain/harness/detect-mutations';
import {
  gateKey,
  isFailure,
  type CiAttempt,
  type GatePolicy,
  type PrMetrics,
  type PullRequestFacts,
} from '../domain/pull-request/types';
export const calculateFirstPassGreen = (attempts: CiAttempt[]) => attempts[0]?.firstPass ?? null;
export const calculateEventuallyGreen = (attempts: CiAttempt[]): boolean | null =>
  attempts.some((a) => a.green === true)
    ? true
    : attempts.length && attempts.every((a) => a.green === false)
      ? false
      : null;
export const calculateAttemptsToGreen = (attempts: CiAttempt[]) => {
  const first = [...attempts]
    .filter((a) => a.greenAt)
    .sort((a, b) => a.greenAt!.localeCompare(b.greenAt!) || a.order - b.order)[0];
  return first ? first.order + 1 : null;
};
export const calculateCleanGreen = (green: boolean | null, mutation: boolean | null) =>
  green === false || mutation === true ? false : green === true && mutation === false ? true : null;
export function calculateTimeToGreen(attempts: CiAttempt[]): number | null {
  const firstGreen = attempts.flatMap((a) => (a.greenAt ? [a.greenAt] : [])).sort()[0];
  const starts = attempts.flatMap((a) => a.checks.map((c) => c.startedAt));
  if (!firstGreen || !starts.length || starts.some((s) => !s)) return null;
  return Math.max(
    0,
    Math.floor((Date.parse(firstGreen) - Math.min(...starts.map((s) => Date.parse(s!)))) / 1000),
  );
}
export function calculatePrMetrics(
  facts: PullRequestFacts,
  policy: GatePolicy,
  attempts: CiAttempt[],
): PrMetrics {
  const failed = attempts.flatMap((a) => a.checks).filter((c) => isFailure(c.conclusion));
  const greenAt = attempts.flatMap((a) => (a.greenAt ? [a.greenAt] : [])).sort()[0] ?? null;
  const mutation = policy.gates.length
    ? detectHarnessChangedAfterFailure(facts, attempts, greenAt)
    : null;
  let first = calculateFirstPassGreen(attempts),
    eventually = calculateEventuallyGreen(attempts);
  if (!facts.historyComplete && first === true) first = null;
  if ((!facts.historyComplete || !facts.closedAt) && eventually === false) eventually = null;
  const paths = [...new Set(facts.files.map((f) => f.path))];
  return {
    ciAttemptCount: attempts.length,
    firstPassGreen: first,
    eventuallyGreen: eventually,
    attemptsToGreen: facts.historyComplete ? calculateAttemptsToGreen(attempts) : null,
    timeToFirstGreenSeconds: facts.historyComplete ? calculateTimeToGreen(attempts) : null,
    failedCheckCount: failed.length,
    uniqueFailedGateCount: new Set(failed.map(gateKey)).size,
    testFilesChanged: paths.filter((p) => classifyHarnessFile(p) === 'test').length,
    harnessFilesChanged: paths.filter(isHarnessFile).length,
    harnessChangedAfterFailure: mutation,
    cleanGreen: calculateCleanGreen(eventually, mutation),
    evidenceStatus: !policy.gates.length
      ? 'unconfigured'
      : !facts.historyComplete
        ? 'incomplete'
        : first === null || eventually === null
          ? 'pending'
          : 'complete',
    evidenceReasons: [...new Set(facts.issues)].sort(),
    analyzerVersion: '1.0.0',
    gatePolicyVersion: policy.version,
  };
}
