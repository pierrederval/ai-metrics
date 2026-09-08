import { classifyMergedPr, classifyWorkflow } from './classify';
import { UTC_DAY_MS } from './range';
import type {
  CiOutcome,
  Comparisons,
  CoverageReason,
  Day,
  MetricTotals,
  PeriodAggregate,
  PrEvidence,
  Range,
  Rate,
  WorkflowAttempt,
} from './types';
const emptyCi = (): Record<CiOutcome, number> => ({
  'first-pass': 0,
  recovered: 0,
  failed: 0,
  pending: 0,
  cancelled: 0,
  skipped: 0,
  neutral: 0,
  unknown: 0,
});
const emptyPr = () => ({ 'first-pass': 0, 'not-first-pass': 0, ineligible: 0, unknown: 0 });
const rate = (numerator: number, denominator: number, excluded = 0): Rate => ({
  numerator,
  denominator,
  excluded,
  value: denominator ? (100 * numerator) / denominator : null,
});
const dayOf = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : null;
/** Returns only a provable terminal UTC date; sourceUpdatedAt is never a completion. */
function terminalDay(a: WorkflowAttempt, cutoff: number): string | null {
  if (a.status.toLowerCase() !== 'completed') return null;
  if (a.completedAt && Date.parse(a.completedAt) <= cutoff) return dayOf(a.completedAt);
  if (
    !a.completedAt &&
    a.terminalObservedAt &&
    Date.parse(a.terminalObservedAt) <= cutoff &&
    dayOf(a.startedAt) === dayOf(a.terminalObservedAt)
  )
    return dayOf(a.terminalObservedAt);
  return null;
}
export function aggregatePeriod(evidence: PrEvidence[], range: Range): PeriodAggregate {
  const days: Day[] = Array.from({ length: range.days }, (_, i) => ({
    date: new Date(Date.parse(range.start) + i * UTC_DAY_MS).toISOString().slice(0, 10),
    merged: 0,
    mergedValue: null,
    firstPass: rate(0, 0),
    ci: emptyCi(),
    prOutcomes: emptyPr(),
    coverage: 'unknown',
  }));
  const byDay = new Map(days.map((d) => [d.date, d]));
  const reasons = new Set<CoverageReason>();
  const runs = new Map<string, Map<number, WorkflowAttempt>>();
  const unique = new Map(evidence.map((pr) => [pr.id, pr]));
  for (const pr of unique.values()) {
    const day = byDay.get(dayOf(pr.mergedAt) ?? '');
    if (day) {
      day.merged++;
      const outcome = classifyMergedPr(pr);
      day.prOutcomes[outcome]++;
      if (outcome === 'unknown') reasons.add('evidence-incomplete');
      if (!pr.chronologyComplete || !pr.reviewsComplete || !pr.ciComplete)
        reasons.add('evidence-incomplete');
    }
    if (
      !pr.ciComplete &&
      (!pr.openedAt || Date.parse(pr.openedAt) < Date.parse(range.endExclusive))
    )
      reasons.add('evidence-incomplete');
    for (const a of pr.attempts) {
      // Database linkage enforces this; also fail closed for pure callers.
      if (a.repositoryId !== pr.repositoryId) continue;
      const key = `${a.repositoryId}\u0000${a.runId}`;
      const run = runs.get(key) ?? new Map<number, WorkflowAttempt>();
      run.set(a.attempt, a);
      runs.set(key, run);
    }
  }
  const undatedCi = emptyCi();
  // Classifiers use inclusive cutoffs; range endpoints are exclusive at millisecond precision.
  const cutoff = Date.parse(range.endExclusive) - 1;
  for (const run of runs.values()) {
    const attempts = [...run.values()]
      .filter(
        (a) =>
          !a.startedAt ||
          !Number.isFinite(Date.parse(a.startedAt)) ||
          Date.parse(a.startedAt) <= cutoff,
      )
      .sort((a, b) => a.attempt - b.attempt);
    if (!attempts.length) continue;
    const latest = attempts.at(-1)!;
    const outcome = classifyWorkflow(attempts, new Date(cutoff).toISOString());
    let date = terminalDay(latest, cutoff);
    if (outcome === 'pending') {
      // Pending is excluded activity, attributed to the latest attempt's start
      // day. This is explicitly not a terminal completion date.
      date = dayOf(latest.startedAt);
    }
    if (!date) {
      undatedCi[outcome]++;
      reasons.add('unknown-workflow-date');
      continue;
    }
    const day = byDay.get(date);
    if (day) {
      day.ci[outcome]++;
      if (outcome === 'unknown') reasons.add('evidence-incomplete');
    }
  }
  for (const d of days) {
    d.firstPass = rate(
      d.prOutcomes['first-pass'],
      d.prOutcomes['first-pass'] + d.prOutcomes['not-first-pass'],
      d.prOutcomes.ineligible + d.prOutcomes.unknown,
    );
    d.mergedValue = d.merged || null;
    if (d.merged || Object.values(d.ci).some(Boolean)) d.coverage = 'partial';
  }
  return { days, totals: sumDays(days), undatedCi, coverageReasons: [...reasons] };
}
export function aggregateDays(evidence: PrEvidence[], range: Range): Day[] {
  return aggregatePeriod(evidence, range).days;
}
/** Sum raw counts first. Rates and KPI totals have exactly the chart's denominators. */
export function sumDays(days: Day[]): MetricTotals {
  const ci = emptyCi(),
    prOutcomes = emptyPr();
  let merged = 0;
  for (const d of days) {
    merged += d.merged;
    for (const key of Object.keys(ci) as CiOutcome[]) ci[key] += d.ci[key];
    for (const key of Object.keys(prOutcomes) as (keyof typeof prOutcomes)[])
      prOutcomes[key] += d.prOutcomes[key];
  }
  const ciDenominator = ci['first-pass'] + ci.recovered + ci.failed;
  const ciExcluded = ci.pending + ci.cancelled + ci.skipped + ci.neutral + ci.unknown;
  return {
    merged,
    prOutcomes,
    ci,
    firstPass: rate(
      prOutcomes['first-pass'],
      prOutcomes['first-pass'] + prOutcomes['not-first-pass'],
      prOutcomes.unknown + prOutcomes.ineligible,
    ),
    ciSuccess: rate(ci['first-pass'] + ci.recovered, ciDenominator, ciExcluded),
    ciRecovered: rate(ci.recovered, ciDenominator, ciExcluded),
  };
}
export function comparePeriods(
  current: MetricTotals,
  previous: MetricTotals,
  comparable: boolean,
): Comparisons {
  const difference = (a: Rate, b: Rate) =>
    comparable && a.value !== null && b.value !== null ? a.value - b.value : null;
  return {
    mergedPercent:
      comparable && previous.merged
        ? (100 * (current.merged - previous.merged)) / previous.merged
        : null,
    firstPassPoints: difference(current.firstPass, previous.firstPass),
    ciSuccessPoints: difference(current.ciSuccess, previous.ciSuccess),
  };
}
