import type { ReactNode } from 'react';

/**
 * The glass card chrome, as either a `<section>` or a `<div>`. The app's own
 * `<section>` elements are not migrated to this component yet — see
 * boundary.test.ts and the task brief for why `.fn-surface` is a fresh class
 * rather than a rename of the bare `section` selector still in
 * src/app/style.css.
 */
export function Surface({
  as = 'section',
  children,
}: {
  as?: 'section' | 'div';
  children: ReactNode;
}) {
  const Tag = as;
  return <Tag className="fn-surface">{children}</Tag>;
}
