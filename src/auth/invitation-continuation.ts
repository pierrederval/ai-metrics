import 'server-only';
import { decrypt, encrypt } from './crypto';
import { integrationEnv } from '../lib/env';
export const invitationCookie = 'fieldnote-invitation';
export function sealInvitation(token: string, now = Date.now()) {
  if (!/^[\w-]{43}$/.test(token)) throw new Error('Invitation unavailable');
  return encrypt(
    JSON.stringify({ token, issuedAt: now, expiresAt: now + 600000 }),
    integrationEnv().TOKEN_ENCRYPTION_KEY,
  );
}
export function readInvitation(value: string | undefined, now = Date.now()): string | null {
  if (
    !value ||
    value.split('.').length !== 3 ||
    value.split('.').some((part) => Buffer.from(part, 'base64url').toString('base64url') !== part)
  )
    return null;
  try {
    const data = JSON.parse(decrypt(value, integrationEnv().TOKEN_ENCRYPTION_KEY));
    if (
      typeof data.token !== 'string' ||
      !/^[\w-]{43}$/.test(data.token) ||
      !Number.isFinite(data.issuedAt) ||
      data.issuedAt > now ||
      data.expiresAt !== data.issuedAt + 600000 ||
      now >= data.expiresAt
    )
      return null;
    return data.token;
  } catch {
    return null;
  }
}
