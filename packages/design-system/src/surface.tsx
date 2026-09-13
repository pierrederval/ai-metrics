import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type SurfaceProps = {
  as?: 'section' | 'div';
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<'section'>, 'className' | 'children'> & {
    // React's own HTML attribute types don't carry an index signature for
    // arbitrary data-* attributes; several migrated call sites (the basic
    // dashboard's KPI cards) key off one.
    [attribute: `data-${string}`]: string | number | boolean | undefined;
  };

/**
 * The glass card chrome, as either a `<section>` or a `<div>`. Every prop
 * other than `as`/`className`/`children` passes straight through to the
 * rendered element — `id`, `style`, `aria-*`, `data-*`, even `key` (handled
 * by React itself, never seen here) — so a call site's own class rides
 * alongside `fn-surface` rather than replacing it.
 */
export function Surface({ as = 'section', className, children, ...rest }: SurfaceProps) {
  const Tag = as;
  return (
    <Tag className={className ? `fn-surface ${className}` : 'fn-surface'} {...rest}>
      {children}
    </Tag>
  );
}
