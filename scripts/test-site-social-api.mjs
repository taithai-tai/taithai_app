import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialHandler } from '../server-lib/site-social-router.js';

const ORIGIN='https://taithai-app.netlify.app',TOKEN='fixture-verified-user-token-123456789';
const postId='d99f68a0-1020-4d1d-8a9f-f49dd4df84b0';
function fixture() {
  const calls=[];const handler=createSocialHandler({env:{NODE_ENV:'production'},getRuntime:async()=>({store:{},auth:{},social:new Proxy({},{get:(_,method)=>async(user,input)=>{calls.push({method,user,input});return {items:[],...(user?{private:true}:{})};}})}),
    verifyUser:async authorization=>{if(authorization!=='Bearer '+TOKEN)throw Object.assign(Error(),{code:'AUTH_REQUIRED',status:401});return {uid:'alice',email_verified:true,email:'private@example.invalid'};},rate:async()=>{}});
  return {handler,calls,request:(action,{method='GET',origin=ORIGIN,token,body,headers={},query=''}={})=>handler(new Request(ORIGIN+'/api/social/?action='+action+query,{method,headers:{...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}))};
}
test('public reads need no authentication and return private no-store CORS responses',async()=>{
  const f=fixture();for(const action of ['posts','profile','search','follows']){const r=await f.request(action);assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.match(r.headers.get('Cache-Control'),/private.*no-store/);}
  assert.equal(f.calls.length,4);assert.ok(f.calls.every(call=>call.user===null));
});
test('private actions and every mutation reject cookie-only and absent bearer before runtime',async()=>{
  const handler=createSocialHandler({getRuntime:()=>{throw Error('must not initialize')},env:{NODE_ENV:'production'}});
  for(const action of ['me','threads','messages','blocks'])assert.equal((await handler(new Request(ORIGIN+'/api/social/?action='+action,{headers:{cookie:'owner=true'}}))).status,401);
  const r=await handler(new Request(ORIGIN+'/api/social/?action=message-send',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,401);
});
test('a supplied bad token never falls back to anonymous public access',async()=>{
  const f=fixture();assert.equal((await f.request('posts',{token:'bad-token-must-never-be-anonymous'})).status,401);assert.equal(f.calls.length,0);
});
test('verified service identity never receives raw bearer credentials',async()=>{
  const f=fixture(),r=await f.request('post-create',{method:'POST',token:TOKEN,body:{text:'hello',attachments:[],requestId:postId}});assert.equal(r.status,200);
  const call=f.calls[0];assert.equal(call.method,'createPost');assert.equal(Object.getOwnPropertySymbols(call.user).length,0);assert.ok(!JSON.stringify(call.user).includes(TOKEN));assert.equal(call.input.requestId,postId);
});
test('CORS accepts only exact production origins and required request headers',async()=>{
  const f=fixture();for(const origin of ['https://evil.example','https://taithai.app.evil.example','http://localhost:3000','null'])assert.equal((await f.request('posts',{origin})).status,403);
  for(const origin of ['https://taithai.app',ORIGIN]){const r=await f.handler(new Request(ORIGIN+'/api/social/',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type'}}));assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);}
  const r=await f.handler(new Request(ORIGIN+'/api/social/',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-admin'}}));assert.equal(r.status,403);
  assert.equal((await f.request('message-send',{method:'POST',token:TOKEN,origin:null,body:{}})).status,403);
});
test('bounded JSON, unique query keys and unsupported methods fail before service mutation',async()=>{
  const f=fixture();assert.equal((await f.request('message-send',{method:'POST',token:TOKEN,body:'x'.repeat(32769)})).status,413);
  assert.equal((await f.request('message-send',{method:'POST',token:TOKEN,body:'not-json'})).status,400);
  assert.equal((await f.request('message-send',{method:'POST',token:TOKEN,body:{},headers:{'Content-Type':'text/plain'}})).status,400);
  assert.equal((await f.request('me',{token:TOKEN,query:'&extra=private'})).status,400);
  assert.equal((await f.request('posts',{query:'&action=me'})).status,400);
  assert.equal((await f.request('posts',{method:'DELETE'})).status,405);
  assert.equal(f.calls.length,0);
});
test('the operation budget bounds an unresponsive runtime with no late service calls',async()=>{
  const handler=createSocialHandler({operationTimeoutMs:10,getRuntime:()=>new Promise(()=>{})});const r=await handler(new Request(ORIGIN+'/api/social/?action=posts'));assert.equal(r.status,503);assert.equal((await r.json()).error.code,'OPERATION_TIMEOUT');
});

test('own-account media availability uses a read-only probe and preserves profile access when unavailable',async()=>{
  for(const ready of [true,false]){
    let probes=0;
    const handler=createSocialHandler({getRuntime:async()=>({store:{},social:{getMe:async()=>({profile:null,defaults:{displayName:'Alice'}})},media:{health:async user=>{assert.equal(user.uid,'alice');probes++;if(!ready)throw Error('PRIVATE_PROVIDER_DETAIL');return {ready:true,provider:'netlify'};}}}),verifyUser:async()=>({uid:'alice',email_verified:true}),rate:async()=>{}});
    const r=await handler(new Request(ORIGIN+'/api/social/?action=me',{headers:{Authorization:'Bearer '+TOKEN}}));assert.equal(r.status,200);
    const body=await r.json();assert.equal(body.media.ready,ready);assert.equal(body.defaults.displayName,'Alice');assert.equal(probes,1);assert.ok(!JSON.stringify(body).includes('PRIVATE_PROVIDER_DETAIL'));
  }
});
