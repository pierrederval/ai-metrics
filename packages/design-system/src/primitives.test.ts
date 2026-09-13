import { createElement, type ComponentType } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Badge } from './badge';
import { Brand } from './brand';
import { Button } from './button';
import { DataTable } from './data-table';
import { Field } from './field';
import { Notice } from './notice';
import { StatCard } from './stat-card';
import { Surface } from './surface';

// Behaviour, not markup: each test below asserts a prop-to-class or
// prop-to-element mapping the caller can rely on, never a full-markup
// snapshot.
function render<P extends object>(Component: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(Component, props));
}

describe('Brand', () => {
  test('display is the default and carries no compact class', () => {
    expect(render(Brand, {})).not.toContain('fn-brand--compact');
  });

  test('compact emits both the base and compact classes', () => {
    expect(render(Brand, { size: 'compact' })).toContain('class="fn-brand fn-brand--compact"');
  });

  test('renders a plain <a>, never next/link', () => {
    expect(render(Brand, {})).toMatch(/^<a\s/);
  });
});

describe('Button', () => {
  test('accent is the default variant class', () => {
    expect(render(Button, { children: 'Go' })).toContain('class="fn-button"');
  });

  test('variant maps to the right modifier class', () => {
    expect(render(Button, { variant: 'secondary', children: 'Go' })).toContain(
      'class="fn-button fn-button--secondary"',
    );
    expect(render(Button, { variant: 'quiet', children: 'Go' })).toContain(
      'class="fn-button fn-button--quiet"',
    );
  });

  test('forwards type to the rendered button', () => {
    expect(render(Button, { type: 'submit', children: 'Go' })).toContain('type="submit"');
  });

  test('as="button" (the default) renders a <button> element', () => {
    expect(render(Button, { children: 'Go' })).toMatch(/^<button\s/);
  });

  test('as="a" renders an <a> element and forwards href', () => {
    const html = render(Button, { as: 'a', href: '/repo', children: 'GitHub ↗' });
    expect(html).toMatch(/^<a\s/);
    expect(html).toContain('href="/repo"');
  });

  test('every variant takes its finish from tokens, never a literal', () => {
    const css = readFileSync(
      new URL('../styles/components.css', import.meta.url),
      'utf8',
    );
    const button = css.slice(css.indexOf('.fn-button'));
    // A hex in a component rule is how ten button definitions happened the
    // first time. The finish lives in tokens.css or it drifts.
    expect(button).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(button).toContain('var(--fn-gradient-accent)');
    expect(button).toContain('var(--fn-elevation-control)');
  });

  test('the press state is not animated for readers who asked for stillness', () => {
    const css = readFileSync(
      new URL('../styles/components.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});

describe('Badge', () => {
  test('tone maps to the right modifier class', () => {
    expect(render(Badge, { tone: 'positive', children: 'Ran' })).toContain(
      'class="fn-badge fn-badge--positive"',
    );
    expect(render(Badge, { tone: 'caution', children: 'Setup' })).toContain(
      'class="fn-badge fn-badge--caution"',
    );
    expect(render(Badge, { tone: 'neutral', children: 'None' })).toContain(
      'class="fn-badge fn-badge--neutral"',
    );
  });
});

describe('Surface', () => {
  test('as maps to the element rendered, defaulting to section', () => {
    expect(render(Surface, { children: 'x' })).toMatch(/^<section\s/);
    expect(render(Surface, { as: 'div', children: 'x' })).toMatch(/^<div\s/);
  });
});

describe('StatCard', () => {
  test('renders the label and value, omitting detail when absent', () => {
    const html = render(StatCard, { label: 'Score', value: 92 });
    expect(html).toContain('fn-stat-card__label');
    expect(html).toContain('fn-stat-card__value');
    expect(html).not.toContain('fn-stat-card__detail');
  });

  test('renders detail when present', () => {
    expect(render(StatCard, { label: 'Score', value: 92, detail: 'of 100' })).toContain(
      'fn-stat-card__detail',
    );
  });
});

describe('Notice', () => {
  test('renders its children inside the notice class', () => {
    expect(render(Notice, { children: 'Harness modified after failed CI.' })).toContain(
      'class="notice"',
    );
  });
});

describe('Field', () => {
  test('associates the label with the input by id', () => {
    const html = render(Field, { label: 'Name', id: 'member-name' });
    expect(html).toContain('for="member-name"');
    expect(html).toContain('id="member-name"');
  });

  test('forwards input attributes', () => {
    expect(render(Field, { label: 'Email', id: 'email', type: 'email', required: true })).toContain(
      'type="email"',
    );
  });
});

describe('DataTable', () => {
  test('wraps its children in a table inside the scroll wrapper', () => {
    const html = render(DataTable, { children: createElement('tbody') });
    expect(html).toContain('class="scroll"');
    expect(html).toMatch(/<table><tbody/);
  });
});
