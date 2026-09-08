import { and, eq } from 'drizzle-orm';
import { db } from '..';
import { userInterests } from '../schema';

const feature = 'expanded-history';

export async function persistHistoryInterest(userId: string): Promise<void> {
  await db()
    .insert(userInterests)
    .values({ userId, feature })
    .onConflictDoNothing({
      target: [userInterests.userId, userInterests.feature],
    });
}

export async function hasHistoryInterest(userId: string): Promise<boolean> {
  const [interest] = await db()
    .select({ userId: userInterests.userId })
    .from(userInterests)
    .where(and(eq(userInterests.userId, userId), eq(userInterests.feature, feature)));
  return Boolean(interest);
}
