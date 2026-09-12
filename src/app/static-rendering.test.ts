import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';
// AppShell reads runtime configuration (env, cookies, database) on every
// render, none of which exists during `next build`. A route that renders it
// must therefore opt out of static prerendering, or the build crashes while
// exporting the page instead of failing at request time.
const appDir = join(import.meta.dirname);
const dynamicOptOut = "export const dynamic = 'force-dynamic'";
function files(dir: string, name: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name), name)
      : entry.name === name
        ? [join(dir, entry.name)]
        : [],
  );
}
function optsOut(file: string): boolean {
  return readFileSync(file, 'utf8').includes(dynamicOptOut);
}
test('every route rendering the app shell opts out of static prerendering', () => {
  const shells = files(appDir, 'layout.tsx').filter((file) =>
    readFileSync(file, 'utf8').includes('app-shell'),
  );
  expect(shells.length).toBeGreaterThan(0);
  const prerendered = shells.flatMap((shell) => {
    const segment = shell.slice(0, -'/layout.tsx'.length);
    if (optsOut(shell)) return [];
    return files(segment, 'page.tsx').filter(
      (page) =>
        !optsOut(page) &&
        !files(segment, 'layout.tsx').some(
          (layout) => page.startsWith(layout.slice(0, -'/layout.tsx'.length)) && optsOut(layout),
        ),
    );
  });
  expect(prerendered.map((page) => relative(appDir, page))).toEqual([]);
});
