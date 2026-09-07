import { z } from 'zod';
import { integrationEnv } from '../lib/env';
export const credentialsSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.number().nullable(),
  refreshToken: z.string().nullable(),
});
export type Credentials = z.infer<typeof credentialsSchema>;
const responseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
});
export async function exchangeToken(parameters: Record<string, string>): Promise<Credentials> {
  const config = integrationEnv();
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      ...parameters,
    }),
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GitHub authorization failed (${response.status})`);
  const result = responseSchema.parse(await response.json());
  return {
    accessToken: result.access_token,
    expiresAt: result.expires_in ? Date.now() + result.expires_in * 1000 : null,
    refreshToken: result.refresh_token ?? null,
  };
}
