import { z } from 'zod';
const base = z.object({DATABASE_URL:z.url(),DEMO_MODE:z.enum(['true','false']).default('false'),NODE_ENV:z.string().default('development')});
const integration = z.object({GITHUB_APP_ID:z.string().min(1),GITHUB_PRIVATE_KEY:z.string().min(1),GITHUB_WEBHOOK_SECRET:z.string().min(16),GITHUB_CLIENT_ID:z.string().min(1),GITHUB_CLIENT_SECRET:z.string().min(1),APP_URL:z.url(),TOKEN_ENCRYPTION_KEY:z.string().regex(/^[a-fA-F0-9]{64}$/),INNGEST_DEV:z.enum(['0','1']).default('0'),INNGEST_EVENT_KEY:z.string().optional(),INNGEST_SIGNING_KEY:z.string().optional()});
export function parseEnv(input: NodeJS.ProcessEnv){
 const result=base.parse(input);
 if(result.DEMO_MODE==='true' && result.NODE_ENV==='production') throw new Error('Demo authentication is forbidden in production');
 if(result.DEMO_MODE==='true') return {...result,integration:null};
 const config=integration.parse(input);
 if(config.INNGEST_DEV!=='1'&&(!config.INNGEST_EVENT_KEY||!config.INNGEST_SIGNING_KEY)) throw new Error('Inngest production keys required');
 if(result.NODE_ENV==='production'&&(config.INNGEST_DEV==='1'||!config.APP_URL.startsWith('https://'))) throw new Error('Production requires HTTPS and signed Inngest');
 return {...result,integration:config};
}
export const env = () => parseEnv(process.env);
export function integrationEnv(){const value=env().integration;if(!value) throw new Error('GitHub integration is disabled in demo mode');return value;}
