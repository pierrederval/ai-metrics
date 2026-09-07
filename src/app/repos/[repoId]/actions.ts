'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRepository } from '../../../auth/access';
import { setGatePolicy } from '../../../db/queries/persist-pr';
const gateSchema = z.object({ appId: z.string().min(1), name: z.string().min(1).max(500) });
export async function saveGates(repositoryId: string, form: FormData) {
  await requireRepository(repositoryId, true);
  const gates = z
    .array(gateSchema)
    .max(100)
    .parse(form.getAll('gate').map((value) => JSON.parse(String(value))));
  const unique = [...new Map(gates.map((g) => [JSON.stringify([g.appId, g.name]), g])).values()];
  await setGatePolicy(repositoryId, unique);
  revalidatePath('/dashboard');
  revalidatePath(`/repos/${repositoryId}`);
}

export async function requestImport(repositoryId: string) {
  await requireRepository(repositoryId, true);
  const { syncRepository } = await import('../../../github/sync-repository');
  await syncRepository(repositoryId);
  revalidatePath(`/repos/${repositoryId}`);
}
