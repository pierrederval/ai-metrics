import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('src/app/style.css', () => {
  it('holds no colour literal, so the palette exists in exactly one place', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  // Unskipped by Task 7 of docs/superpowers/plans/2026-09-13-application-shell-density.md,
  // once `main` and `nav` are scoped and the shell rules move into the package.
  it.skip('no bare element selector in style.css sets layout', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    // A bare element selector at the start of a line, e.g. `nav {` or `section {`.
    // These land on every matching element in the app: the `nav { display: grid }`
    // written for the sidebar is what stacked the repository breadcrumb onto
    // three rows. Element defaults belong in the package's fn.base layer.
    const bare = [...css.matchAll(/^(nav|section|button|input|label|main)\s*\{/gm)].map(
      (match) => match[1],
    );
    expect(bare).toEqual([]);
  });
});
