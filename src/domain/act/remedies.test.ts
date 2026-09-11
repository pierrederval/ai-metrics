import { describe, expect, it } from 'vitest';
import { proposeRemedies } from './remedies';
import type { CheckResult, GradeResult } from '../grading/types';

const check = (id: string, status: 'pass' | 'fail'): CheckResult => ({
  id,
  points: status === 'pass' ? 20 : 0,
  maxPoints: 20,
  status,
  paths: [],
  lineRanges: [],
  explanation: `${id} explanation.`,
});

const grade = (checks: CheckResult[]): GradeResult => ({
  score: 0,
  checks,
  rubricVersion: '0.1.0',
  evaluatorVersion: '1.0.0',
});

describe('proposeRemedies', () => {
  it('proposes nothing when every check passes', () => {
    expect(proposeRemedies(grade([check('root-readme', 'pass')]))).toEqual([]);
  });

  it('proposes one remedy per failing check and ignores passing ones', () => {
    const result = proposeRemedies(
      grade([check('root-agent-instructions', 'fail'), check('root-readme', 'pass')]),
    );
    expect(result).toEqual([
      {
        checkId: 'root-agent-instructions',
        path: 'AGENTS.md',
        rationale: 'root-agent-instructions explanation.',
        ordinal: 0,
      },
    ]);
  });

  it('takes the rationale from the grade, claiming nothing the grader did not observe', () => {
    const [remedy] = proposeRemedies(grade([check('root-readme', 'fail')]));
    expect(remedy.rationale).toBe('root-readme explanation.');
  });

  it('answers setup and tests in the file an agent reads, so one path may repeat', () => {
    const result = proposeRemedies(
      grade([check('documented-setup', 'fail'), check('documented-tests', 'fail')]),
    );
    expect(result.map((remedy) => remedy.path)).toEqual(['AGENTS.md', 'AGENTS.md']);
    expect(result.map((remedy) => remedy.checkId)).toEqual([
      'documented-setup',
      'documented-tests',
    ]);
  });

  it('numbers remedies from zero in the rubric order the grade supplies', () => {
    const result = proposeRemedies(
      grade([
        check('root-agent-instructions', 'fail'),
        check('root-readme', 'fail'),
        check('docs-markdown', 'fail'),
      ]),
    );
    expect(result.map((remedy) => remedy.ordinal)).toEqual([0, 1, 2]);
    expect(result.map((remedy) => remedy.path)).toEqual([
      'AGENTS.md',
      'README.md',
      'docs/README.md',
    ]);
  });

  it('proposes nothing for a check id it does not recognise', () => {
    expect(proposeRemedies(grade([check('invented-check', 'fail')]))).toEqual([]);
  });
});
