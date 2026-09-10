import { z } from 'zod';

export function normalizeEmail(email: string): string {
  return z.email().max(254).parse(email.trim().toLowerCase());
}
