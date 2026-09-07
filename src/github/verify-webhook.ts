import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyWebhook(bytes: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(bytes).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
