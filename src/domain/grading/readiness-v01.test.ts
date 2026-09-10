import { describe, expect, test } from 'vitest';
import { evaluateReadiness, readinessRubric } from './readiness-v01';
import type { RepositorySnapshot, SourceDocument } from './types';

const document = (path: string, text: string, blobSha = `${path}-sha`): SourceDocument => ({
  path,
  blobSha,
  text,
});

const snapshot = (documents: SourceDocument[], complete = true): RepositorySnapshot => ({
  sha: 'commit-sha',
  complete,
  documents,
});

test('incomplete evidence cannot receive a zero or perfect score', () => {
  const result = evaluateReadiness(snapshot([], false));

  expect(result.score).toBeNull();
  expect(result.incompleteReason).toBeDefined();
});

test('empty complete repo scores zero', () => {
  expect(evaluateReadiness(snapshot([])).score).toBe(0);
});

test('publishes a frozen, versioned five-check rubric', () => {
  expect(readinessRubric).toMatchObject({
    family: 'agent-readiness',
    version: '0.1.0',
    evaluatorVersion: '1.0.0',
  });
  expect(readinessRubric.checks).toHaveLength(5);
  expect(readinessRubric.checks.every((check) => check.maxPoints === 20)).toBe(true);
  expect(Object.isFrozen(readinessRubric)).toBe(true);
  expect(Object.isFrozen(readinessRubric.checks)).toBe(true);
});

describe('file checks', () => {
  test.each(['AGENTS.md', 'CLAUDE.md'])('%s supplies root agent instructions', (path) => {
    const result = evaluateReadiness(snapshot([document(path, 'Use pnpm.')]));

    expect(result.checks[0]).toMatchObject({ status: 'pass', points: 20, paths: [path] });
  });

  test('both instruction files pass once and preserve both evidence records', () => {
    const result = evaluateReadiness(
      snapshot([document('AGENTS.md', 'Agent rules'), document('CLAUDE.md', 'Claude rules')]),
    );

    expect(result.score).toBe(20);
    expect(result.checks[0].points).toBe(20);
    expect(result.checks[0].paths).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });

  test('empty instruction files do not pass', () => {
    const result = evaluateReadiness(
      snapshot([document('AGENTS.md', ' \n\t'), document('CLAUDE.md', '')]),
    );

    expect(result.checks[0].status).toBe('fail');
  });

  test('README filename is matched case-insensitively at the root', () => {
    const result = evaluateReadiness(snapshot([document('readME.MD', '# Project')]));

    expect(result.checks[1]).toMatchObject({ status: 'pass', paths: ['readME.MD'] });
  });

  test('docs accepts nonempty Markdown files with case-insensitive path and extension', () => {
    const result = evaluateReadiness(
      snapshot([
        document('DOCS/guide.MARKDOWN', 'Guide'),
        document('docs/empty.md', '  '),
        document('docs/note.txt', 'No'),
      ]),
    );

    expect(result.checks[2]).toMatchObject({ status: 'pass', paths: ['DOCS/guide.MARKDOWN'] });
  });
});

describe('documented command checks', () => {
  test('setup and testing headings require a nonempty fenced block in their section', () => {
    const result = evaluateReadiness(
      snapshot([
        document(
          'README.md',
          [
            '# Project',
            '## Installation',
            '```sh',
            'pnpm install',
            '```',
            '## Testing',
            '~~~sh',
            'pnpm test',
            '~~~',
          ].join('\n'),
          'readme-blob',
        ),
      ]),
    );

    expect(result.score).toBe(60);
    expect(result.checks[3]).toMatchObject({ status: 'pass', paths: ['README.md'] });
    expect(result.checks[4]).toMatchObject({ status: 'pass', paths: ['README.md'] });
    expect(result.checks[3].lineRanges).toEqual([
      { path: 'README.md', blobSha: 'readme-blob', start: 2, end: 5 },
    ]);
    expect(result.checks[4].lineRanges).toEqual([
      { path: 'README.md', blobSha: 'readme-blob', start: 6, end: 9 },
    ]);
  });

  test('absent, empty, and later-section fences do not satisfy a heading', () => {
    const result = evaluateReadiness(
      snapshot([
        document(
          'README.md',
          ['## Setup', '```sh', '   ', '```', '## Notes', '```sh', 'pnpm install', '```'].join(
            '\n',
          ),
        ),
      ]),
    );

    expect(result.checks[3].status).toBe('fail');
  });

  test('headings inside fenced code do not start sections', () => {
    const result = evaluateReadiness(
      snapshot([
        document(
          'README.md',
          ['```md', '## Setup', '```sh', 'pnpm install', '```', '```'].join('\n'),
        ),
      ]),
    );

    expect(result.checks[3].status).toBe('fail');
  });

  test('a deeper heading remains inside the candidate section', () => {
    const result = evaluateReadiness(
      snapshot([
        document(
          'docs/runbook.md',
          ['## Getting Started', '### Shell', '```', 'pnpm dev', '```'].join('\n'),
        ),
      ]),
    );

    expect(result.checks[3].status).toBe('pass');
  });
});

test('all five checks produce 100 while documenting the score limitation', () => {
  const result = evaluateReadiness(
    snapshot([
      document('AGENTS.md', 'Follow repository conventions.'),
      document('README.md', ['# Fieldnote', '## Setup', '```sh', 'pnpm install', '```'].join('\n')),
      document('docs/testing.MD', ['# Validation', '```sh', 'pnpm test', '```'].join('\n')),
    ]),
  );

  expect(result.score).toBe(100);
  expect(result.checks.every((check) => check.status === 'pass')).toBe(true);
  expect(result.checks.every((check) => check.explanation.includes('not semantic quality'))).toBe(
    true,
  );
});
