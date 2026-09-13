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
