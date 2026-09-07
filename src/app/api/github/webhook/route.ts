import { dispatchEvent } from '../../../../inngest/dispatch';
import { integrationEnv } from '../../../../lib/env';
import { verifyWebhook } from '../../../../github/verify-webhook';
import { webhookPayload } from '../../../../github/types';
import { persistEvent } from '../../../../db/queries/events';
export const runtime='nodejs';
export async function POST(request:Request){
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(!verifyWebhook(bytes,request.headers.get('x-hub-signature-256'),integrationEnv().GITHUB_WEBHOOK_SECRET))return Response.json({error:'Invalid signature'},{status:401});
 const deliveryId=request.headers.get('x-github-delivery'),name=request.headers.get('x-github-event');
 if(!deliveryId||!name)return Response.json({error:'Missing delivery metadata'},{status:400});
 let payload;try{payload=webhookPayload.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));}catch{return Response.json({error:'Invalid webhook payload'},{status:400});}
 const event=await persistEvent(deliveryId,name,payload,{action:payload.action,installationId:payload.installation?String(payload.installation.id):undefined,repositoryId:payload.repository?String(payload.repository.id):undefined});
 try{await dispatchEvent(event.id);}catch{console.error('Webhook dispatch failed',{deliveryId,repositoryId:event.repositoryId});return Response.json({error:'Stored; dispatch will retry'},{status:503});}
 return Response.json({id:event.id,stored:true});
}
