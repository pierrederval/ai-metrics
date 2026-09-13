import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { TopBar } from './top-bar';

const render = () =>
  renderToStaticMarkup(
    h(
      TopBar,
      null,
      h(TopBar.Context, null, 'where you are'),
      h(TopBar.Utility, null),
      h(TopBar.Identity, null, 'account'),
    ),
  );

test('identity is last in the DOM, so it is last to the keyboard too', () => {
  const html = render();
  expect(html.indexOf('fn-topbar__context')).toBeLessThan(html.indexOf('fn-topbar__utility'));
  expect(html.indexOf('fn-topbar__utility')).toBeLessThan(html.indexOf('fn-topbar__identity'));
});

test('an empty utility slot renders no control', () => {
  // Search and notifications are reserved, not built. The slot holds the
  // position; it must not ship a placeholder, a disabled button or an icon.
  const html = render();
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<input');
});

test('the bar is a banner landmark', () => {
  expect(render()).toContain('role="banner"');
});
