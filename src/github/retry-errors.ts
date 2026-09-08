import { z } from 'zod';
const errorSchema = z.object({
  status: z.number().optional(),
  message: z.string().optional(),
  errorCategory: z.string().optional(),
  retryAt: z.string().datetime().optional(),
  response: z.object({ headers: z.record(z.string(), z.unknown()).optional() }).optional(),
});
export interface GithubRetryFailure {
  status?: number;
  errorCategory: 'rate-limit' | 'access' | 'transient';
  retryAt: string;
}
// Copy only allowlisted scheduling information; never retain request, headers, or raw messages.
export function captureGithubRetry(error: unknown, now = new Date()): GithubRetryFailure {
  const parsed = errorSchema.safeParse(error);
  const status = parsed.success ? parsed.data.status : undefined;
  const headers = parsed.success ? (parsed.data.response?.headers ?? {}) : {};
  const limited =
    (parsed.success && parsed.data.errorCategory === 'rate-limit') ||
    status === 429 ||
    (status === 403 &&
      (headers['retry-after'] !== undefined ||
        headers['x-ratelimit-remaining'] === '0' ||
        (parsed.success &&
          /secondary rate limit|abuse detection/i.test(parsed.data.message ?? ''))));
  let deadline = now.getTime() + (limited ? 60000 : 300000);
  if (limited) {
    const seconds = Number(headers['retry-after']),
      reset = Number(headers['x-ratelimit-reset']);
    if (Number.isFinite(seconds) && seconds > 0)
      deadline = Math.max(deadline, now.getTime() + seconds * 1000);
    if (Number.isFinite(reset) && reset > 0) deadline = Math.max(deadline, reset * 1000 + 1000);
  }
  if (parsed.success && parsed.data.retryAt)
    deadline = Math.max(deadline, Date.parse(parsed.data.retryAt));
  return {
    status,
    errorCategory: limited
      ? 'rate-limit'
      : status === 403 || status === 404
        ? 'access'
        : 'transient',
    retryAt: new Date(deadline).toISOString(),
  };
}
export class GithubCollectionRetryError extends Error {
  readonly status: number | undefined;
  readonly errorCategory: GithubRetryFailure['errorCategory'];
  readonly retryAt: string;
  constructor(readonly retryFailures: GithubRetryFailure[]) {
    super('GitHub evidence collection requires retry');
    const limited = retryFailures.find((failure) => failure.errorCategory === 'rate-limit');
    this.status = (limited ?? retryFailures[0]).status;
    this.errorCategory = limited ? 'rate-limit' : retryFailures[0].errorCategory;
    this.retryAt = new Date(
      Math.max(...retryFailures.map((failure) => Date.parse(failure.retryAt))),
    ).toISOString();
  }
}
