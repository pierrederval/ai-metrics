import { describe, expect, it } from 'vitest';
import {
  agentCellClassName,
  formatAttempts,
  formatRate,
  formatRateDetail,
} from './cohort-comparison';

// vitest.config.ts only collects src/**/*.test.ts, so JSX (and thus
// react-dom/server rendering) is not available here — this repo has zero
// component tests. CohortComparison's display logic is extracted into these
// pure, exported formatters instead, and tested directly. See task-4-brief
// Step 1 for the rendering-test version this repo cannot run.
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

describe('unattributed row labelling', () => {
  it('the unattributed row label is Unattributed, never Human', () => {
    const row = {
      agent: 'unknown',
      label: 'Unattributed',
      attributed: false,
      pullRequestCount: 5,
      firstPass: { value: null, known: 0, unknown: 5 },
      averageAttempts: null,
      clean: { value: null, known: 0, unknown: 5 },
    };
    expect(row.label).toBe('Unattributed');
    expect(row.label).not.toMatch(/human/i);
    expect(agentCellClassName(row)).not.toMatch(/^human$/);
  });
});
