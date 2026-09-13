import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'accent' | 'secondary' | 'quiet';
export type ButtonSize = 'md' | 'lg';

type ButtonShared = { variant?: ButtonVariant; size?: ButtonSize };

/**
 * `as="a"` is what makes a genuine link — the repository header's
 * "GitHub ↗" — renderable without becoming a `<button>`. `href` (and the
 * rest of `AnchorHTMLAttributes`) is only assignable when `as="a"`; the
 * `ButtonHTMLAttributes` branch has no `href` to accept it.
 *
 * `ref` is declared explicitly (React 19's "ref as a prop": no `forwardRef`
 * needed) rather than left for `ButtonHTMLAttributes`/`AnchorHTMLAttributes`
 * to supply — neither carries it — because a real call site
 * (history-interest.tsx's dialog trigger and retry button) holds a ref to
 * the rendered element for focus management, exactly as it did as a plain
 * `<button>`. `rest` below is spread onto the host element unchanged, so
 * `ref` reaches the DOM node the same way any other native prop does.
 */
export type ButtonProps =
  | ({ as?: 'button'; ref?: Ref<HTMLButtonElement> } & ButtonShared &
      ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: 'a'; ref?: Ref<HTMLAnchorElement> } & ButtonShared &
      AnchorHTMLAttributes<HTMLAnchorElement>);

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
