import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { integrationEnv } from '../../../../lib/env';
import { cookieOptions } from '../../../../auth/session';
export async function GET(){
 const config=integrationEnv(),state=randomBytes(32).toString('base64url');
 (await cookies()).set('github-oauth-state',state,{...cookieOptions,maxAge:600});
 const url=new URL('https://github.com/login/oauth/authorize');url.searchParams.set('client_id',config.GITHUB_CLIENT_ID);url.searchParams.set('state',state);url.searchParams.set('redirect_uri',`${config.APP_URL}/api/auth/callback`);
 return NextResponse.redirect(url);
}
