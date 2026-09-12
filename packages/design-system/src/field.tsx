import type { InputHTMLAttributes } from 'react';

/**
 * A label bound to an input by `id`. The binding is the whole point: a label
 * that only sits next to its input reads fine and is useless to a screen
 * reader, so `id` is required rather than optional.
 */
export function Field({
  label,
  id,
  className,
  ...rest
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const classes = ['fn-field', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...rest} />
    </div>
  );
}
