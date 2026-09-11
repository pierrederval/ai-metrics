import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { gradePresentation } from '../../domain/grading/presentation';
import { GradeBanner } from './grade-banner';

// gradePresentation is the single source of truth for tier label, colour and
// symbol shape/count (presentation.test.ts exercises that function itself).
// These tests don't hardcode a second tier list — each expectation is derived
// by calling the real function, then checked against what GradeBanner
// actually rendered, at every score the rubric can currently produce plus
// every finish boundary the design doc requires support for.
test.each([0, 49, 50, 69, 70, 79, 80, 89, 90, 99, 100])(
  'score %s: banner shows the score, gradePresentation label and symbol count',
  (score) => {
    const expected = gradePresentation(score);
    const html = renderToStaticMarkup(createElement(GradeBanner, { score }));

    expect(html).toContain(`>${score}<`);
    expect(html).toContain(`>${expected.label}<`);

    const marker = expected.symbol === 'circle' ? '<circle' : 'm12 1';
    const otherMarker = expected.symbol === 'circle' ? 'm12 1' : '<circle';
    expect(html.split(marker).length - 1).toBe(expected.count);
    expect(html).not.toContain(otherMarker);
  },
);

test('banner carries no next-tier block, flavour line or scale — those stay on the full card', () => {
  const html = renderToStaticMarkup(createElement(GradeBanner, { score: 60 }));
  expect(html).not.toContain('grade-card-scale');
  expect(html).not.toContain('grade-card-move');
  expect(html).not.toContain('Next tier');
  expect(html).not.toContain('Rubric');
});

test('untrusted score input cannot inject markup', () => {
  expect(() => renderToStaticMarkup(createElement(GradeBanner, { score: Number.NaN }))).toThrow();
});
