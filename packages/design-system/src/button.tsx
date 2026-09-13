import type { ButtonHTMLAttributes } from 'react';

const VARIANT = {
  accent: '',
  secondary: 'fn-button-secondary',
  quiet: 'fn-button-quiet',
} as const;

/**
 * `accent` is the default rust fill, `secondary` the ink fill the sign-in
 * button uses, `quiet` an underlined run of text that happens to be a button.
 *
 * `type` is forwarded rather than defaulted: a button inside a form without an
 * explicit type submits it, and several callers rely on exactly that.
 */
export function Button({
  variant = 'accent',
  size = 'md',
  className,
  ...rest
}: {
  variant?: keyof typeof VARIANT;
  size?: 'md' | 'lg';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ['fn-button', VARIANT[variant], size === 'lg' ? 'fn-button-lg' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button className={classes} {...rest} />;
}
