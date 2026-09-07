import { z } from 'zod';
export const webhookPayload=z.object({action:z.string().optional(),installation:z.object({id:z.number()}).passthrough().optional(),repository:z.object({id:z.number()}).passthrough().optional()}).passthrough();
