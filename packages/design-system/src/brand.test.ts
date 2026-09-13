import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Brand } from './brand';

const render = (props: Parameters<typeof Brand>[0]) =>
  renderToStaticMarkup(createElement(Brand, props));

test('the sidebar lockup is one row and the marketing lockup is not', () => {
  expect(render({ size: 'compact' })).toContain('fn-brand fn-brand--compact');
  expect(render({ size: 'display' })).not.toContain('fn-brand--compact');
});

test('display is the default, so the landing page nav needs no prop', () => {
  expect(render({})).not.toContain('fn-brand--compact');
});

test('both sizes keep the accessible name and the seal', () => {
  for (const size of ['compact', 'display'] as const) {
    const html = render({ size });
    expect(html).toContain('aria-label="Fieldnote home"');
    expect(html).toContain('fieldnote');
    expect(html).toContain('<svg');
  }
});
