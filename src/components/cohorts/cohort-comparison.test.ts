import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  agentCellClassName,
  CohortComparison,
  COHORT_EMPTY,
  COHORT_POPULATION,
  formatAttempts,
  formatRate,
  formatRateDetail,
} from './cohort-comparison';
import type { CohortRow, CohortTable } from '../../domain/cohorts/types';

// vitest.config.ts only collects src/**/*.test.ts, so JSX is not available
// here: CohortComparison's display logic lives in pure exported formatters
// tested directly, and the component itself is rendered the way this repo
// renders components from a plain .test.ts — createElement plus
// renderToStaticMarkup, no jsdom and no testing library.
describe('formatRate', () => {
  it('renders a null rate as unknown, never as 0%', () => {
    expect(formatRate({ value: null, known: 0, unknown: 2 })).toBe('—');
    expect(formatRate({ value: null, known: 0, unknown: 2 })).not.toMatch(/0(\.0)?%/);
  });

  it('renders a known rate to one decimal place with a percent sign', () => {
    expect(formatRate({ value: 83.333, known: 5, unknown: 1 })).toBe('83.3%');
  });

  it('renders a known rate of exactly zero as 0.0%, distinct from unknown', () => {
    // A real 0.0% (evidence collected, every attempt failed) must stay
    // visually distinguishable from "we have no evidence" (—).
    expect(formatRate({ value: 0, known: 3, unknown: 0 })).toBe('0.0%');
  });
});

describe('formatRateDetail', () => {
  it('reports known and unknown counts in the MetricCards form', () => {
    expect(formatRateDetail({ value: null, known: 0, unknown: 2 })).toBe('0 known · 2 unknown');
    expect(formatRateDetail({ value: 83.3, known: 5, unknown: 1 })).toBe('5 known · 1 unknown');
  });
});

describe('formatAttempts', () => {
  it('renders a null average as unknown, never as 0', () => {
    expect(formatAttempts(null)).toBe('—');
  });

  it('renders a known average to one decimal place', () => {
    expect(formatAttempts(1.8)).toBe('1.8');
  });
});

describe('agentCellClassName', () => {
  it('labels attributed cohorts with the plain agentcell class', () => {
    expect(agentCellClassName({ attributed: true })).toBe('agentcell');
  });

  it('gives the unattributed cohort the human CSS hook without saying human', () => {
    const className = agentCellClassName({ attributed: false });
    expect(className).toBe('agentcell human');
  });
});

describe('CohortComparison', () => {
  const row: CohortRow = {
    agent: 'codex',
    label: 'Codex',
    attributed: true,
    pullRequestCount: 2,
    firstPass: { value: 50, known: 2, unknown: 0 },
    averageAttempts: 1.5,
    clean: { value: 50, known: 2, unknown: 0 },
  };
  const table = (rows: CohortRow[]): CohortTable => ({
    rows,
    totalPullRequests: rows.reduce((sum, r) => sum + r.pullRequestCount, 0),
    attributedPullRequests: rows
      .filter((r) => r.attributed)
      .reduce((sum, r) => sum + r.pullRequestCount, 0),
  });
  const render = (rows: CohortRow[]) =>
    renderToStaticMarkup(createElement(CohortComparison, { table: table(rows) }));

  // A newly connected repository has no rows on day one, on the view the
  // product exists to produce. A headers-only table is not an empty state.
  it('renders an empty state instead of a headers-only table when there are no rows', () => {
    const html = render([]);
    expect(html).toContain(COHORT_EMPTY);
    expect(html).not.toContain('<table');
    expect(html).toContain('How each agent is doing');
  });

  it('states the population the table counts, so it can be told from Delivery', () => {
    const html = render([row]);
    expect(html).toContain(COHORT_POPULATION);
    expect(html).toContain('merged');
    expect(html).toContain('<table');
  });

  it('does not claim a population when there is nothing to explain', () => {
    expect(render([])).not.toContain(COHORT_POPULATION);
  });
});
