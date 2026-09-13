import type { ReactNode } from 'react';

/**
 * The horizontal-scroll wrapper around a `<table>`. Table element chrome
 * (`table`/`td`/`th`) lives in this package's base.css already; `.scroll`
 * is the one class this primitive adds.
 */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="scroll">
      <table>{children}</table>
    </div>
  );
}
