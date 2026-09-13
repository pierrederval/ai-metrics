import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Brand } from './brand';
import { Button } from './button';
import { DataTable } from './data-table';
import { Field } from './field';
import { Notice } from './notice';
import { StatCard } from './stat-card';
import { Surface } from './surface';

// Not snapshots. A snapshot of this markup would fail on every whitespace
// change and pass on every change that actually matters. What is asserted here
// is the part each primitive has a contract about: which class a variant maps
// to, what gets forwarded, and what is bound to what.

describe('Button', () => {
  it.each([
    ['accent', 'fn-button'],
    ['secondary', 'fn-button-secondary'],
    ['quiet', 'fn-button-quiet'],
  ] as const)('maps variant %s onto %s', (variant, expected) => {
    const html = renderToStaticMarkup(createElement(Button, { variant }));
    expect(html).toContain(expected);
  });

  it('is not large unless asked', () => {
    expect(renderToStaticMarkup(createElement(Button, {}))).not.toContain('fn-button-lg');
    expect(renderToStaticMarkup(createElement(Button, { size: 'lg' }))).toContain('fn-button-lg');
  });

  // A button inside a form with no explicit type submits it. Several callers
  // depend on that, so the prop has to reach the element rather than being
  // defaulted away.
  it('forwards type', () => {
    expect(renderToStaticMarkup(createElement(Button, { type: 'submit' }))).toContain(
      'type="submit"',
    );
  });
});

describe('Badge', () => {
  it.each([
    ['positive', 'fn-badge-positive'],
    ['caution', 'fn-badge-caution'],
    ['neutral', 'fn-badge-neutral'],
  ] as const)('maps tone %s onto %s', (tone, expected) => {
    const html = renderToStaticMarkup(createElement(Badge, { tone, children: 'Ran' }));
    expect(html).toContain(expected);
    expect(html).toContain('Ran');
  });
});

describe('Field', () => {
  it('binds its label to its input by id, which is the whole point of it', () => {
    const html = renderToStaticMarkup(
      createElement(Field, { label: 'Repository', id: 'repo', defaultValue: '' }),
    );
    expect(html).toContain('for="repo"');
    expect(html).toContain('id="repo"');
  });

  it('forwards input attributes', () => {
    const html = renderToStaticMarkup(
      createElement(Field, { label: 'Search', id: 'q', type: 'search', placeholder: 'Find' }),
    );
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Find"');
  });
});

describe('Surface', () => {
  it('is a section by default and a div on request', () => {
    expect(renderToStaticMarkup(createElement(Surface, { children: 'x' }))).toContain('<section');
    expect(renderToStaticMarkup(createElement(Surface, { as: 'div', children: 'x' }))).toContain(
      '<div',
    );
  });
});

describe('StatCard', () => {
  it('omits the detail line rather than rendering an empty one', () => {
    const without = renderToStaticMarkup(createElement(StatCard, { label: 'PRs', value: '4' }));
    expect(without).not.toContain('class="s"');
    const with_ = renderToStaticMarkup(
      createElement(StatCard, { label: 'PRs', value: '4', detail: '2 merged' }),
    );
    expect(with_).toContain('2 merged');
  });
});

describe('Brand', () => {
  // The package imports no framework, so the app injects next/link. The
  // default has to stay a real anchor or the marketing page has no link at all.
  it('renders a plain anchor by default', () => {
    const html = renderToStaticMarkup(createElement(Brand, { href: '/' }));
    expect(html).toContain('<a class="brand" href="/"');
    expect(html).toContain('Fieldnote home');
  });

  it('renders through an injected link component instead, when given one', () => {
    const Stub = (props: { className?: string; href: string }) =>
      createElement('span', { 'data-stub': 'yes', 'data-href': props.href });
    const html = renderToStaticMarkup(createElement(Brand, { as: Stub, href: '/dashboard' }));
    expect(html).toContain('data-stub="yes"');
    expect(html).toContain('data-href="/dashboard"');
    expect(html).not.toContain('<a class="brand"');
  });
});

describe('Notice and DataTable', () => {
  it('render their children inside the class the stylesheet targets', () => {
    expect(renderToStaticMarkup(createElement(Notice, { children: 'Careful' }))).toContain(
      'fn-notice',
    );
    expect(renderToStaticMarkup(createElement(DataTable, { children: 'rows' }))).toContain(
      'fn-data-table',
    );
  });
});
