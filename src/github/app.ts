import { App, Octokit } from 'octokit';
import { integrationEnv } from '../lib/env';
let instance: App | undefined;
export function githubApp() {
  const config = integrationEnv();
  return (instance ??= new App({
    appId: config.GITHUB_APP_ID,
    privateKey: config.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'),
    webhooks: { secret: config.GITHUB_WEBHOOK_SECRET },
    Octokit: Octokit.defaults({ request: { timeout: 30000 } }),
  }));
}
