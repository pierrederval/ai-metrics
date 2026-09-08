import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Octokit } from 'octokit';
import { integrationEnv } from '../../../../lib/env';
import { equalSecret, encrypt } from '../../../../auth/crypto';
import { exchangeToken } from '../../../../auth/oauth';
import { createSession } from '../../../../auth/session';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { ensureDefaultWorkspace } from '../../../../workspaces/store';
export async function GET(request: Request) {
  const url = new URL(request.url),
    jar = await cookies(),
    expected = jar.get('github-oauth-state')?.value,
    state = url.searchParams.get('state'),
    code = url.searchParams.get('code');
  jar.delete('github-oauth-state');
  if (!expected || !state || !code || !equalSecret(expected, state))
    return Response.json({ error: 'Invalid OAuth state' }, { status: 400 });
  const credentials = await exchangeToken({
    code,
    redirect_uri: `${integrationEnv().APP_URL}/api/auth/callback`,
  });
  const { data: user } = await new Octokit({
    auth: credentials.accessToken,
  }).rest.users.getAuthenticated();
  const values = {
    id: String(user.id),
    login: user.login,
    displayName: user.name,
    avatarUrl: user.avatar_url,
    credentials: encrypt(JSON.stringify(credentials), integrationEnv().TOKEN_ENCRYPTION_KEY),
  };
  await db()
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        login: values.login,
        avatarUrl: values.avatarUrl,
        credentials: values.credentials,
        updatedAt: new Date(),
      },
    });
  await ensureDefaultWorkspace(values.id);
  await createSession(values.id);
  return NextResponse.redirect(new URL('/dashboard', integrationEnv().APP_URL));
}
