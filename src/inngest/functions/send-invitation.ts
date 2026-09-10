import { inngest } from '../client';
import { invitationSendData } from '../events';
import { deliverInvitation, failInvitationDelivery } from '../../workspaces/delivery';
export const sendInvitationFunction = inngest.createFunction(
  {
    id: 'send-workspace-invitation',
    triggers: [{ event: 'workspace/invitation.send.requested' }],
    retries: 5,
    singleton: { key: 'event.data.deliveryId', mode: 'skip' },
    onFailure: async ({ event }) => {
      await failInvitationDelivery(invitationSendData.parse(event.data.event.data).deliveryId);
    },
  },
  async ({ event, step }) =>
    step.run('deliver', () => deliverInvitation(invitationSendData.parse(event.data).deliveryId)),
);
