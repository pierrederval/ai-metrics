import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { CompletedGrade } from '../../db/queries/grade-runs';
vi.stubGlobal('React', React);
vi.mock('../../app/repos/[repoId]/grading/actions', () => ({ runGrade: vi.fn() }));
import { GradeCard } from './grade-card';
import { GradeReport } from './report';
const sha = 'a'.repeat(40);
const grade: CompletedGrade = {
  id: 'run',
  score: 60,
  sha,
  computedAt: new Date('2026-09-08T00:00:00Z'),
  rubricVersion: '0.1.0',
  evaluatorVersion: '1.0.0',
  checks: [
    {
      id: 'root-readme',
      points: 20,
      maxPoints: 20,
      status: 'pass',
      paths: ['docs/<script>alert(1)</script>.md'],
      lineRanges: [
        { path: 'docs/<script>alert(1)</script>.md', blobSha: 'b'.repeat(40), start: 2, end: 4 },
      ],
      explanation: '<img src=x onerror=alert(1)>',
    },
  ],
};
test('untrusted explanation and path are escaped, links are pinned and encoded', () => {
  const html = renderToStaticMarkup(
    createElement(GradeReport, { grade, owner: 'owner', name: 'repo', outdated: false }),
  );
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain(
    `https://github.com/owner/repo/blob/${sha}/docs/%3Cscript%3Ealert(1)%3C/script%3E.md#L2-L4`,
  );
  expect(html).toContain('Evaluator 1.0.0');
  expect(html).toContain('2026-09-08');
});
test('historical report displays its stored version and outdated notice', () => {
  const html = renderToStaticMarkup(
    createElement(GradeReport, {
      grade: { ...grade, rubricVersion: '0.0.1' },
      owner: 'owner',
      name: 'repo',
      outdated: true,
    }),
  );
  expect(html).toContain('Historical rubric');
  expect(html).toContain('Readiness v0.0.1');
});
test.each([0, 49, 50, 69, 70, 79, 80, 89, 90, 99, 100])(
  'card %s uses accessible SVG markers and real-position thresholds',
  (score) => {
    const html = renderToStaticMarkup(
      createElement(GradeCard, {
        score,
        repositoryName: '<script>repo</script>',
        sha,
        rubricVersion: '0.1.0',
      }),
    );
    expect(html).toContain(`${score} out of 100`);
    expect(html).not.toContain('<script>');
    expect(html).toContain('left:50%');
    expect(html).toContain('left:70%');
    expect(html).toContain('left:80%');
    expect(html).toContain('left:90%');
    expect(html).not.toContain('type="range"');
    expect(html).toContain(score < 70 ? '<circle' : 'm12 1');
    expect(html.includes('Prismatic · Perfect score')).toBe(score === 100);
  },
);

test('actual evaluator checks have readable report headings', async () => {
  const { evaluateReadiness } = await import('../../domain/grading/readiness-v01');
  const evaluated = evaluateReadiness({ sha, complete: true, documents: [] });
  const html = renderToStaticMarkup(
    createElement(GradeReport, {
      grade: { ...grade, ...evaluated },
      owner: 'owner',
      name: 'repo',
      outdated: false,
    }),
  );
  for (const label of [
    'Agent instructions',
    'Project documentation',
    'Documentation',
    'Setup instructions',
    'Validation commands',
  ])
    expect(html).toContain(label);
  for (const check of evaluated.checks) expect(html).not.toContain(check.id);
});
