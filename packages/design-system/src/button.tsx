import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'accent' | 'secondary' | 'quiet';
export type ButtonSize = 'md' | 'lg';

type ButtonShared = { variant?: ButtonVariant; size?: ButtonSize };

/**
 * `as="a"` is what makes a genuine link — the repository header's
 * "GitHub ↗" — renderable without becoming a `<button>`. `href` (and the
 * rest of `AnchorHTMLAttributes`) is only assignable when `as="a"`; the
 * `ButtonHTMLAttributes` branch has no `href` to accept it.
 */
export type ButtonProps =
  | ({ as?: 'button' } & ButtonShared & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: 'a' } & ButtonShared & AnchorHTMLAttributes<HTMLAnchorElement>);

function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return [
    'fn-button',
    variant === 'secondary' && 'fn-button--secondary',
    variant === 'quiet' && 'fn-button--quiet',
    size === 'lg' && 'fn-button--lg',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: ButtonProps) {
  const { variant = 'accent', size = 'md', className, as, ...rest } = props;
  const classes = buttonClassName(variant, size, className);
  if (as === 'a') {
    return <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} />;
  }
  return <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
