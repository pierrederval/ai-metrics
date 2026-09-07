import { createHmac } from 'node:crypto';
import { expect,test } from 'vitest';
import { verifyWebhook } from './verify-webhook';
test('validates exact bytes and rejects missing, malformed and changed signatures',()=>{
 const bytes=Buffer.from('{"hello":"世界"}'),secret='test-secret';
 const signature=`sha256=${createHmac('sha256',secret).update(bytes).digest('hex')}`;
 expect(verifyWebhook(bytes,signature,secret)).toBe(true);
 expect(verifyWebhook(Buffer.concat([bytes,Buffer.from(' ')]),signature,secret)).toBe(false);
 expect(verifyWebhook(bytes,null,secret)).toBe(false);expect(verifyWebhook(bytes,'sha256=nothex',secret)).toBe(false);
});
