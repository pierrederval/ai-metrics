import { inngest } from '../client';
import { reconcileInvitationDeliveries } from '../../workspaces/delivery';
export const reconcileInvitations = inngest.createFunction(
  { id: 'reconcile-invitations', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => step.run('reconcile', reconcileInvitationDeliveries),
);
