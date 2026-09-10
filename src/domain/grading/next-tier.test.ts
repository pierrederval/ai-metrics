import { describe, expect, it } from 'vitest';
import { nextTier } from './next-tier';
import type { CheckResult } from './types';
const check = (id: string, status: 'pass' | 'fail'): CheckResult => ({
  id,
  points: status === 'pass' ? 20 : 0,
  maxPoints: 20,
  status,
  paths: [],
  lineRanges: [],
  explanation: '',
});
describe('nextTier', () => {
  it('names the next reachable tier, not the next threshold', () => {
    // 80 with one failing 20-point check can only reach 100.
    const checks = [
      check('root-agent-instructions', 'pass'),
      check('root-readme', 'pass'),
      check('docs-markdown', 'pass'),
      check('documented-setup', 'pass'),
      check('documented-tests', 'fail'),
    ];
    const result = nextTier(80, checks);
    expect(result?.targetScore).toBe(100);
    expect(result?.targetFinish).toBe('Prismatic');
  });
  it('lists every failing check as a move, highest points first', () => {
    // Synthetic, differing maxPoints supplied out of order: today's rubric is
    // uniformly 20 points, which cannot distinguish a correct descending sort
    // from no sort at all. The spec names a finer-grained rubric ("ten checks
    // worth ten points") as the natural direction, so nextTier — a pure
    // function over CheckResult[] — must sort correctly regardless of shape.
    const checkWithMax = (id: string, maxPoints: number): CheckResult => ({
      id,
      points: 0,
      maxPoints,
      status: 'fail',
      paths: [],
      lineRanges: [],
      explanation: '',
    });
    const checks = [
      checkWithMax('docs-markdown', 20),
      checkWithMax('root-agent-instructions', 30),
      checkWithMax('documented-tests', 10),
    ];
    const result = nextTier(40, checks);
    expect(result?.moves).toHaveLength(3);
    expect(result?.moves.map((m) => m.points)).toEqual([30, 20, 10]);
  });
  it('returns null at a perfect score', () => {
    const checks = Array.from({ length: 5 }, (_, i) => check(`c${i}`, 'pass'));
    expect(nextTier(100, checks)).toBeNull();
  });
});
