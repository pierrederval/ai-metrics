export type HarnessFileCategory =
  'test' | 'ci' | 'test-config' | 'quality-config' | 'package-config' | 'source' | 'other';
export function classifyHarnessFile(path: string): HarnessFileCategory {
  if (/(^|\/)\.github\/(workflows|actions)\//.test(path)) return 'ci';
  const name = path.split('/').at(-1)!;
  if (/^(playwright|jest|vitest|cypress)\.config\./.test(name)) return 'test-config';
  if (/^(eslint\.config\.|\.eslintrc)/.test(name) || /^tsconfig.*\.json$/.test(name))
    return 'quality-config';
  if (name === 'package.json') return 'package-config';
  if (/(^|\/)(tests?|e2e|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path))
    return 'test';
  return /\.[cm]?[jt]sx?$/.test(path) ? 'source' : 'other';
}
export const isHarnessFile = (path: string) =>
  !['source', 'other'].includes(classifyHarnessFile(path));
