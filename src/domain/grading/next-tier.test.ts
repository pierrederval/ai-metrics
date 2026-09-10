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
    const checks = [
      check('root-agent-instructions', 'fail'),
      check('root-readme', 'pass'),
      check('docs-markdown', 'fail'),
      check('documented-setup', 'pass'),
      check('documented-tests', 'fail'),
    ];
    const result = nextTier(40, checks);
    expect(result?.moves).toHaveLength(3);
    expect(result?.moves.every((m) => m.points === 20)).toBe(true);
  });
  it('returns null at a perfect score', () => {
    const checks = Array.from({ length: 5 }, (_, i) => check(`c${i}`, 'pass'));
    expect(nextTier(100, checks)).toBeNull();
  });
});
