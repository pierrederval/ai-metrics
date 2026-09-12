import type { ReactNode } from 'react';

/**
 * The glass card the whole product sits on. Renders a `<section>` by default —
 * which is also what the bare element selector in components.css styles, so
 * existing app markup and this component land on exactly the same treatment.
 * `as="div"` is for the places where a section would be a landmark the page
 * does not want.
 */
export function Surface({
  as = 'section',
  className,
  children,
}: {
  as?: 'section' | 'div';
  className?: string;
  children: ReactNode;
}) {
  const classes = ['fn-surface', className].filter(Boolean).join(' ');
  return as === 'div' ? (
    <div className={classes}>{children}</div>
  ) : (
    <section className={classes}>{children}</section>
  );
}
