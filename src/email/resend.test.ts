import { afterEach, expect, test, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { sendInvitationEmail } from './resend';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
test('provider failure is not reported as sent', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  vi.stubEnv('RESEND_FROM_EMAIL', 'team@example.com');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
  await expect(
    sendInvitationEmail({
      deliveryId: 'd',
      to: 'a@example.com',
      workspaceName: 'Team',
      url: 'https://example.com/invitations/token',
    }),
  ).rejects.toThrow();
});
test('plain text request uses stable key and real newlines; snapshots sender', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  vi.stubEnv('RESEND_FROM_EMAIL', 'new@example.com');
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'provider' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    sendInvitationEmail({
      deliveryId: 'd',
      to: 'a@example.com',
      workspaceName: '<b>Team</b>',
      url: 'https://example.com/invitations/fixture',
      from: 'original@example.com',
    }),
  ).resolves.toEqual({ id: 'provider' });
  const init = fetcher.mock.calls[0][1];
  const body = JSON.parse(init.body);
  expect(init.headers['Idempotency-Key']).toBe('d');
  expect(body.from).toBe('original@example.com');
  expect(body.html).toBeUndefined();
  expect(body.text).toContain('accept:\nhttps://');
  expect(body.text).toContain('<b>Team</b>');
});
test('missing email configuration never calls provider', async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    sendInvitationEmail({
      deliveryId: 'd',
      to: 'a@example.com',
      workspaceName: 'Team',
      url: 'https://example.com',
    }),
  ).rejects.toMatchObject({ code: 'email_unavailable' });
  expect(fetcher).not.toHaveBeenCalled();
});
test('optional email config is independent and rejects invalid sender addresses', async () => {
  const { emailEnv } = await import('../lib/env');
  expect(
    emailEnv({ RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'team@example.com' }),
  ).not.toBeNull();
  expect(emailEnv({ RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'invalid' })).toBeNull();
});
