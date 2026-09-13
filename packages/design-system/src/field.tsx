import type { InputHTMLAttributes } from 'react';

/**
 * A labelled input. `id` is required and is what associates the `<label>`
 * with the `<input>` — no `useId` here, since the caller must already supply
 * a stable id to be a good citizen of forms in general.
 */
export function Field({
  label,
  id,
  ...rest
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="fn-field">
      <label className="fn-field__label" htmlFor={id}>
        {label}
      </label>
      <input className="fn-field__input" id={id} {...rest} />
    </div>
  );
}
