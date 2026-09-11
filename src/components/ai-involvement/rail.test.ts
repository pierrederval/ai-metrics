import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { railRows, AiInvolvementRail } from './rail';
import type { Detection } from '../../domain/ai-involvement/types';
import type { DetectionState } from '../../db/queries/ai-involvement';

vi.mock('next/link', () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => createElement('a', { href, className }, children),
}));

const d = (agent: string, occurrences: number | null, signal = 'executed'): Detection =>
  ({
    agent,
    occurrences,
    signal,
    kind: 'coding-agent',
    evidence: [],
    firstSeenAt: null,
    lastSeenAt: '2026-09-01T00:00:00Z',
  }) as Detection;

test('at most four rows are shown and the rest are counted', () => {
  const result = railRows([d('a', 5), d('b', 4), d('c', 3), d('d', 2), d('e', 1)]);
  expect(result.shown).toHaveLength(4);
  expect(result.hiddenCount).toBe(1);
});

test('executed rows sort before configured rows', () => {
  const result = railRows([d('cursor', null, 'configured'), d('codex', 1)]);
  expect(result.shown.map((row) => row.agent)).toEqual(['codex', 'cursor']);
});

test('four detections hide nothing', () => {
  expect(railRows([d('a', 4), d('b', 3), d('c', 2), d('d', 1)]).hiddenCount).toBe(0);
});

test('no detections show nothing and hide nothing', () => {
  expect(railRows([])).toEqual({ shown: [], hiddenCount: 0 });
});

// Regression: `.ai-rail-row` is a fixed three-column grid (mark, name,
// state). Before the fix, an agent with no inlined mark (e.g. `devin`)
// rendered only two grid children, which shoved the name into the mark's
// 20px column and the state into the name's flexible column — the row's
// text visibly broke even though `AgentMark` returning `null` for an
// unmarked agent is by design. Every row must always emit the same three
// grid cells, mark cell included, whether or not it draws anything.
test('a rail row keeps a mark cell, a name cell, and a state cell even when the agent has no mark', () => {
  const state: DetectionState = {
    scannedSha: null,
    detectorVersion: '0.1.0',
    executedRefreshedAt: null,
    configuredRefreshedAt: null,
    incompleteReason: null,
  };
  const html = renderToStaticMarkup(
    createElement(AiInvolvementRail, {
      detections: [d('codex', 3), d('devin', 1)],
      state,
      repoId: 'repository:1',
    }),
  );
  const rows = [...html.matchAll(/<div class="ai-rail-row">(.*?)<\/div>/gs)].map((m) => m[1]);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.match(/<span class="ai-rail-mark">/g)).toHaveLength(1);
    expect(row.match(/<span class="ai-rail-name">/g)).toHaveLength(1);
    expect(row.match(/<span class="ai-rail-state /g)).toHaveLength(1);
    expect(row.indexOf('ai-rail-mark')).toBeLessThan(row.indexOf('ai-rail-name'));
    expect(row.indexOf('ai-rail-name')).toBeLessThan(row.indexOf('ai-rail-state'));
  }
  // devin (the second row, by occurrences) has no inlined mark: its mark
  // cell must still be present in the DOM, just empty.
  expect(rows[1]).toContain('<span class="ai-rail-mark"></span>');
});
