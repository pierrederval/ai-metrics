import { expect, test } from 'vitest';
import { classifyHarnessFile } from './classify-file';
test('classifies test files and ordinary source separately', () => {
  expect(classifyHarnessFile('src/checkout.test.ts')).toBe('test');
  expect(classifyHarnessFile('src/checkout.ts')).toBe('source');
});
test.each([
  ['packages/app/.github/workflows/ci.yml','ci'], ['.github/actions/setup/action.yml','ci'],
  ['playwright.config.ts','test-config'],['packages/web/vitest.config.mts','test-config'],
  ['jest.config.cjs','test-config'],['cypress.config.ts','test-config'],
  ['.eslintrc.json','quality-config'],['eslint.config.mjs','quality-config'],['packages/web/tsconfig.build.json','quality-config'],
  ['package.json','package-config'],['packages/web/package.json','package-config'],
  ['foo/__tests__/x.ts','test'],['test/x.py','test'],['e2e/foo.ts','test'],['src/x.spec.tsx','test'],
  ['README.md','other'],['contest/x.ts','source'],['src/testing.ts','source']
])('classifies %s as %s',(path,category)=>expect(classifyHarnessFile(path)).toBe(category));
