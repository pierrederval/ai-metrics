import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { sessions } from '../../../../db/schema';
import { tokenHash } from '../../../../auth/crypto';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    return new Response('Invalid origin', { status: 403 });
  const jar = await cookies(),
    token = jar.get('reliability-session')?.value;
  if (token)
    await db()
      .delete(sessions)
      .where(eq(sessions.id, tokenHash(token)));
  jar.delete('reliability-session');
  return NextResponse.redirect(new URL('/signed-out', request.url), 303);
}
