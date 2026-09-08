import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
const navigation = vi.hoisted(() => ({ pathname: '/repos', search: 'days=30' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
import { Sidebar } from './sidebar';
test('repositories is a dedicated active destination and navigation retains range only', () => {
  navigation.search = 'days=30&private=ignore';
  const html = renderToStaticMarkup(createElement(Sidebar));
  expect(html).toContain('href="/repos?days=30"');
  expect(html).toContain('aria-current="page" href="/repos?days=30"');
  expect(html).toContain('href="/dashboard?days=30"');
  expect(html).not.toContain('private=ignore');
});
