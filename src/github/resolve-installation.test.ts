import { expect, test } from 'vitest';
import { resolveWebhookInstallationId } from './resolve-installation';

test('keeps the installation ID delivered by a GitHub App webhook', async () => {
  const id = await resolveWebhookInstallationId(
    { installationId: '159755948', payload: {} },
    async () => {
      throw new Error('repository lookup must not run');
    },
  );

  expect(id).toBe('159755948');
});

test('resolves the installation for a repository webhook', async () => {
  const id = await resolveWebhookInstallationId(
    {
      installationId: null,
      payload: {
        repository: {
          owner: { login: 'pierrederval' },
          name: 'ai-metrics',
        },
      },
    },
    async ({ owner, repo }) => {
      if (owner !== 'pierrederval' || repo !== 'ai-metrics')
        throw new Error('wrong repository lookup');
      return 159755948;
    },
  );

  expect(id).toBe('159755948');
});
