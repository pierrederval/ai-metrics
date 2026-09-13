import { expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The package is framework-agnostic and self-contained by design: it must
// not reach into the app it is extracted from, and it must not reach into
// Next.js, since a design system consumed by more than one app cannot
// assume any particular framework.
const SRC_DIR = fileURLToPath(new URL('./src', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

test('the design system imports nothing from the app or from Next.js', () => {
  const files = collectSourceFiles(SRC_DIR);
  const offenders = files.flatMap((file) =>
    importSpecifiers(readFileSync(file, 'utf8'))
      .filter(
        (specifier) =>
          specifier.startsWith('../../') ||
          specifier.includes('src/') ||
          specifier.startsWith('next/'),
      )
      .map((specifier) => `${file}: ${specifier}`),
  );
  expect(offenders).toEqual([]);
});

// Colour lives in exactly one place: tokens.css. Every other stylesheet in
// the package — components.css (Task 3's eight primitives plus Task 4's
// TopBar/Breadcrumb), base.css, reset.css, index.css, and whatever is added
// later — must hold no hex literal of its own, same idiom, same regex, as
// src/app/style.test.ts's guard over the app's own stylesheet. The
// directory is read at test time (not a hardcoded file list) so a new
// stylesheet is covered automatically. This does not special-case the
// `.fn-button` control-finish rules' `rgb(90 26 10 / 0.28)` text-shadow:
// that is an rgb() function, not a hex literal, so the hex-only regex below
// correctly leaves it alone without an exemption.
const STYLES_DIR = 'packages/design-system/styles';

function styleFilesExceptTokens(): string[] {
  return readdirSync(STYLES_DIR)
    .filter((entry) => entry.endsWith('.css') && entry !== 'tokens.css')
    .map((entry) => join(STYLES_DIR, entry));
}

test('no stylesheet outside tokens.css holds a colour literal', () => {
  const offenders = styleFilesExceptTokens().flatMap((file) => {
    const css = readFileSync(file, 'utf8');
    return (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((hex) => `${file}: ${hex}`);
  });
  expect(offenders).toEqual([]);
});
