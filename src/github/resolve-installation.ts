import { z } from 'zod';

type InstallationLookup = (repository: { owner: string; repo: string }) => Promise<number>;
const repositoryIdentity = z.object({
  owner: z.object({ login: z.string().min(1) }),
  name: z.string().min(1),
});

export async function resolveWebhookInstallationId(
  event: { installationId: string | null; payload: Record<string, unknown> },
  lookup: InstallationLookup,
): Promise<string | null> {
  if (event.installationId) return event.installationId;
  const repository = repositoryIdentity.safeParse(event.payload.repository);
  if (!repository.success) return null;
  return String(await lookup({ owner: repository.data.owner.login, repo: repository.data.name }));
}
