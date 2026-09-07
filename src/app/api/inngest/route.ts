import { syncPullRequestFunction } from '../../../inngest/functions/sync-pull-request';
import { serve } from 'inngest/next';
import { inngest } from '../../../inngest/client';
import { processGithubEvent } from '../../../inngest/functions/process-github-event';
import { reconcileEvents } from '../../../inngest/functions/reconcile';
import { recomputePrFunction } from '../../../inngest/functions/recompute-pr';
export const runtime='nodejs';
export const {GET,POST,PUT}=serve({client:inngest,functions:[syncPullRequestFunction,processGithubEvent,reconcileEvents,recomputePrFunction]});
