import {
  invitationCookie,
  sealInvitation,
  readInvitation,
} from '../../../../auth/invitation-continuation';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { integrationEnv } from '../../../../lib/env';
import { cookieOptions } from '../../../../auth/session';
export async function GET(request: Request) {
  const config = integrationEnv(),
    state = randomBytes(32).toString('base64url');
  const jar = await cookies();
  jar.delete(invitationCookie);
  const token = readInvitation(new URL(request.url).searchParams.get('invitation') ?? undefined);
  if (token && /^[\w-]{43}$/.test(token))
    jar.set(invitationCookie, sealInvitation(token), {
      ...cookieOptions,
      maxAge: 600,
    });
  jar.set('github-oauth-state', state, { ...cookieOptions, maxAge: 600 });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.GITHUB_CLIENT_ID);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', `${config.APP_URL}/api/auth/callback`);
  return NextResponse.redirect(url);
}
