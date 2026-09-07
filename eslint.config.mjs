import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.next/**', '.next-smoke/**', '.pnpm-store/**', 'node_modules/**', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
);
