'use client';
import { useActionState } from 'react';
export function SettingsForm({
  action,
  children,
  submitLabel = 'Save changes',
}: {
  action: (form: FormData) => Promise<{ error?: string }>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, run, pending] = useActionState(
    async (_: { error?: string }, form: FormData) => action(form),
    {},
  );
  return (
    <form action={run} className="settings-form">
      {children}
      <button disabled={pending} type="submit">
        {pending ? 'Saving…' : submitLabel}
      </button>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
