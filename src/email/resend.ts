import 'server-only';
import { emailEnv } from '../lib/env';
export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(code);
  }
}
export type InvitationEmail = {
  deliveryId: string;
  to: string;
  workspaceName: string;
  url: string;
  from?: string;
};
export async function sendInvitationEmail(input: InvitationEmail): Promise<{ id: string }> {
  const config = emailEnv();
  if (!config) throw new EmailDeliveryError('email_unavailable');
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.deliveryId,
      },
      body: JSON.stringify({
        from: input.from ?? config.RESEND_FROM_EMAIL,
        to: [input.to],
        subject: 'Join your Fieldnote workspace',
        text: `You were invited to ${input.workspaceName}. Sign in with GitHub to accept:\n${input.url}\nThis invitation expires in seven days.`,
      }),
    });
  } catch {
    throw new EmailDeliveryError('email_network', true);
  }
  if (!response.ok)
    throw new EmailDeliveryError(
      'email_provider',
      response.status === 429 || response.status >= 500,
    );
  const data = await response.json().catch(() => null);
  if (!data || typeof data.id !== 'string') throw new EmailDeliveryError('email_response', true);
  return { id: data.id };
}
