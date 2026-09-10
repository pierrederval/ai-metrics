import type { CohortRow, CohortTable } from '../../domain/cohorts/types';
import './cohort-comparison.css';

type Rate = { value: number | null; known: number; unknown: number };

/**
 * Copies the exact unknown-vs-zero treatment MetricCards already uses
 * (src/components/metrics.tsx): a rate with no known evidence renders as
 * unknown, never as `0%`. A cohort with no CI evidence rendered as `0.0%`
 * would read as "this agent never passes first try" — the opposite of the
 * truth — so missing evidence must stay visibly unknown.
 */
export function formatRate(rate: Rate): string {
  return rate.value === null ? '—' : `${rate.value.toFixed(1)}%`;
}

/** Same "known · unknown" trailer MetricCards renders under each rate. */
export function formatRateDetail(rate: Rate): string {
  return `${rate.known} known · ${rate.unknown} unknown`;
}

/** Same average-attempts fallback MetricCards uses: no known/unknown pairing, just the number. */
export function formatAttempts(value: number | null): string {
  return value?.toFixed(1) ?? '—';
}

/**
 * The unattributed cohort keeps the preview's `.agentcell.human` CSS hook
 * for its distinct (lighter, italic) border treatment, but that is a class
 * name only — no user-visible text may ever say "human". `row.label` comes
 * from loadCohorts already set to "Unattributed"; this function never
 * rewrites it and never emits "Human".
 */
export function agentCellClassName(row: Pick<CohortRow, 'attributed'>): string {
  return row.attributed ? 'agentcell' : 'agentcell human';
}

// Server component: renders static cohort data handed down by the page, no interactivity.
export function CohortComparison({ table }: { table: CohortTable }) {
  return (
    <div className="bigcard cohortcard">
      <span className="t">How each agent is doing</span>
      <div className="scroll">
        <table className="cohort">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>PRs</th>
              <th>First-pass green</th>
              <th>Attempts to green</th>
              <th>Clean green</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.agent}>
                <td className={agentCellClassName(row)}>{row.label}</td>
                <td className="num">{row.pullRequestCount}</td>
                <td>
                  <span className="num">{formatRate(row.firstPass)}</span>
                  <span className="ratedetail">{formatRateDetail(row.firstPass)}</span>
                </td>
                <td className="num">{formatAttempts(row.averageAttempts)}</td>
                <td>
                  <span className="num">{formatRate(row.clean)}</span>
                  <span className="ratedetail">{formatRateDetail(row.clean)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
