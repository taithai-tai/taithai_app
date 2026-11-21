import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembershipHandler, createMembershipWebhook, readMembershipRequest } from '../server-lib/site-membership-router.js';
import { membershipConfig, membershipBillingStore, liveMailMembership, consumeMembershipRate, verifyMembershipUser, readMembershipBody, MembershipError, ownerMailTrialAllowed } from '../server-lib/site-membership-core.js';
import { assertMembershipMailRouting, membershipMailEntitlement } from '../server-lib/site-membership-runtime.js';

const owner={uid:'owner',email:'taithai5002@gmail.com',email_verified:true};
const member={uid:'member_1',email:'member@example.com',email_verified:true};
const tokens={member:'member_token_fixture_123456789',owner:'owner_token_fixture_123456789',unverified:'unverified_fixture_123456789',revoked:'revoked_token_fixture_123456789'};
const env={NODE_ENV:'production',STRIPE_SECRET_KEY:['rk','test','fixture12345678901234567890'].join('_'),STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:'webhook_fixture_private',FIREBASE_SERVICE_ACCOUNT_JSON:'{}'};

function memory() {
  const data=new Map(),keys=[];let chain=Promise.resolve();
  const store={
    data,keys,
    async get(key){keys.push(['get',key]);return data.get(key)||null;},
    async set(key,value,{merge=false}={}){keys.push(['set',key]);data.set(key,merge?{...data.get(key),...value}:value);},
    async create(key,value){keys.push(['create',key]);if(data.has(key))throw Error('exists');data.set(key,value);},
    async delete(key){keys.push(['delete',key]);data.delete(key);},
    async list(name){keys.push(['list',name]);return [...data].filter(([key])=>key.startsWith(name+'/')).map(([key,value])=>({...value,id:key.split('/')[1]}));},
    transaction(fn){const operation=chain.then(()=>fn(store));chain=operation.catch(()=>{});return operation;},
    runTransaction(fn){return store.transaction(fn);},
    async withLock(key,fn){keys.push(['lock',key]);return fn();},
  };return store;
}
function harness(extra={}) {
  const calls=[],store=memory();let runtimeCalls=0;
  const runtime={store,
    auth:{async verifyIdToken(token,revoked){calls.push(['auth',token,revoked]);if(token===tokens.revoked)throw Error('revoked');if(token===tokens.owner)return owner;if(token===tokens.unverified)return {...member,email_verified:false};if(token===tokens.member)return member;throw Error('invalid');}},
    billing:{
      async getStatus(user){calls.push(['billing-status',user.uid]);return {ready:true,membership:{active:false,paid:false,status:'none'},checkoutAvailable:true,portalAvailable:false};},
      async checkout(user,input){calls.push(['checkout',user.uid,input]);return {url:'https://checkout.stripe.com/c/pay/fixture'};},
      async updateQuantity(user,input){calls.push(['quantity-update',user.uid,input]);return {url:'https://billing.stripe.com/p/session/quantity_fixture'};},
      async portal(user){calls.push(['portal',user.uid]);return {url:'https://billing.stripe.com/p/session/fixture'};},
      async adminList(){calls.push(['discount-list']);return {discounts:[]};},
      async adminCreate(user,input){calls.push(['discount-create',user.uid,input]);return {batchId:'fixture',discounts:[]};},
      async adminDisable(user,input){calls.push(['discount-disable',user.uid,input]);return {disabled:[]};},
      async webhook(input){calls.push(['webhook',input]);return {received:true};},
    },
    mail:{
      async status(user){calls.push(['mail-status',user.uid]);return {ready:false,mailboxes:[],canCreate:false,canSend:false};},
      async folders(user,input){calls.push(['folders',user.uid,input]);return {folders:[]};},
      async list(user,input){calls.push(['messages',user.uid,input]);return {messages:[]};},
      async message(user,input){calls.push(['message',user.uid,input]);return {text:'safe'};},
      async create(user,input){calls.push(['mailbox-create',user.uid,input]);return {mailboxes:[]};},
      async send(user,input){calls.push(['send',user.uid,input]);return {status:'sent'};},
      async read(user,input){calls.push(['read',user.uid,input]);return {updated:true};},
      async trash(user,input){calls.push(['trash',user.uid,input]);return {moved:true};},
    },
  };
  const options={env:{...env,...extra.env},getRuntime:async()=>{runtimeCalls++;return runtime;},
    rate:(s,u,scope,config)=>consumeMembershipRate(s,u,scope,{...config,now:100000}),
    checkMailRouting:async()=>{calls.push(['routing']);},...extra};
  const handler=createMembershipHandler(options),webhook=createMembershipWebhook({getRuntime:options.getRuntime});
  const request=(action,{method='GET',token=tokens.member,origin='https://taithai.app',body,headers={},url,contentType='application/json'}={})=>{
    const h={...headers};if(token)h.authorization=`Bearer ${token}`;if(origin)h.origin=origin;if(body!==undefined)h['content-type']=contentType;
    return new Request(url||`https://taithai.app/api/membership?action=${action}`,{method,headers:h,...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  };
  return {handler,webhook,runtime,calls,store,request,runtimeCalls:()=>runtimeCalls};
}
async function result(response){return {status:response.status,body:await response.json(),headers:response.headers};}

test('public/unconfigured status never initializes Firebase or exposes setup secrets',async()=>{
  const f=harness();const anonymous=await result(await f.handler(f.request('status',{token:null})));
  assert.equal(anonymous.status,200);assert.equal(anonymous.body.ready,false);assert.equal(f.runtimeCalls(),0);
  assert.match(anonymous.headers.get('cache-control'),/no-store/);assert.equal(anonymous.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const unavailable=harness({env:{...env,FIREBASE_SERVICE_ACCOUNT_JSON:''}});
  const response=await result(await unavailable.handler(unavailable.request('status')));
  assert.equal(response.body.ready,false);assert.equal(unavailable.runtimeCalls(),0);
  assert.equal(JSON.stringify(response.body).includes(env.STRIPE_WEBHOOK_SECRET),false);
});
test('aborted API and webhook requests serialize a private timeout before accessing services',async()=>{
  const f=harness(),controller=new AbortController();controller.abort();
  const api=await result(await f.handler(new Request(f.request('checkout',{method:'POST',body:{requestId:'request_aborted_12345'}}),{signal:controller.signal})));
  assert.equal(api.status,503);assert.equal(api.body.error.code,'OPERATION_TIMEOUT');assert.equal(f.runtimeCalls(),0);
  const hook=await result(await f.webhook(new Request('https://taithai.app/api/membership-webhook/',{method:'POST',body:'{}',headers:{'stripe-signature':'fixture'},signal:controller.signal})));
  assert.equal(hook.status,503);assert.equal(hook.body.error.code,'OPERATION_TIMEOUT');assert.equal(f.runtimeCalls(),0);
  assert.match(hook.headers.get('cache-control'),/no-store/);
});
test('total API budget includes authentication and late auth completion cannot start a payment',async()=>{
  let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  const f=harness({operationTimeoutMs:15,verifyUser:async()=>{entered();await waiting;return member;}});
  const pending=f.handler(f.request('checkout',{method:'POST',body:{requestId:'request_delayed_auth_12345'}}));
  await started;
  const response=await result(await pending);assert.equal(response.status,503);assert.equal(response.body.error.code,'OPERATION_TIMEOUT');
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.some(call=>call[0]==='checkout'),false);assert.equal(f.store.keys.length,0);
});
test('protected actions verify revoked Firebase tokens and require a verified account',async()=>{
  const f=harness();
  for(const [token,status]of [[null,401],[tokens.revoked,401],[tokens.unverified,403]]){
    assert.equal((await f.handler(f.request('portal',{method:'POST',token,body:{}}))).status,status);
  }
  assert.equal(f.calls.some(call=>call[0]==='portal'),false);
  assert.ok(f.calls.filter(call=>call[0]==='auth').every(call=>call[2]===true));
  await assert.rejects(verifyMembershipUser('Bearer short',{auth:f.runtime.auth}),error=>error.code==='AUTH_REQUIRED');
});
test('write origins are checked before auth/business calls; production rejects localhost and missing origins',async()=>{
  const f=harness();
  for(const origin of [null,'https://evil.example','http://localhost:3000']){
    const response=await result(await f.handler(f.request('checkout',{method:'POST',origin,body:{requestId:'fixture'}})));
    assert.equal(response.status,403);assert.equal(response.body.error.code,'ORIGIN_NOT_ALLOWED');
  }
  assert.equal(f.runtimeCalls(),0);
  const local=harness({env:{...env,NODE_ENV:'development'}});
  assert.equal((await local.handler(local.request('portal',{method:'POST',origin:'http://localhost:3000',url:'http://localhost:3000/api/membership?action=portal',body:{}}))).status,200);
});
test('only the verified owner can list/create/disable discounts or inspect setup status',async()=>{
  const f=harness();
  for(const action of ['admin-discounts','admin-status','admin-discount-create','admin-discount-disable']){
    const method=action.endsWith('create')||action.endsWith('disable')?'POST':'GET';
    assert.equal((await f.handler(f.request(action,{method,...(method==='POST'?{body:{}}:{})}))).status,403);
  }
  assert.equal((await f.handler(f.request('admin-discounts',{token:tokens.owner}))).status,200);
  assert.equal((await f.handler(f.request('admin-discount-create',{method:'POST',token:tokens.owner,body:{percentOff:50,count:1}}))).status,200);
  assert.equal(f.calls.filter(call=>call[0]==='discount-create').length,1);
});
test('route accepts only declared action/method combinations and validates JSON before business writes',async()=>{
  const f=harness();
  assert.equal((await f.handler(f.request('checkout',{method:'GET'}))).status,404);
  assert.equal((await f.handler(f.request('status',{method:'DELETE'}))).status,405);
  for(const body of ['{bad','null','[]'])assert.equal((await f.handler(f.request('checkout',{method:'POST',body}))).status,400);
  assert.equal((await f.handler(f.request('checkout',{method:'POST',body:'{}',contentType:'text/plain'}))).status,400);
  assert.equal(f.calls.some(call=>call[0]==='checkout'),false);
});
test('streamed and declared body sizes are bounded even with a misleading Content-Length',async()=>{
  await assert.rejects(readMembershipRequest(new Request('https://taithai.app/',{method:'POST',body:'12345',headers:{'content-length':'100','content-type':'application/json'}}),{maximum:8}),error=>error.status===413);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5));controller.enqueue(new Uint8Array(5));controller.close();}});
  await assert.rejects(readMembershipRequest(new Request('https://taithai.app/',{method:'POST',body:stream,duplex:'half',headers:{'content-length':'1','content-type':'application/json'}}),{maximum:8}),error=>error.status===413);
  const f=harness();
  const response=await f.handler(f.request('checkout',{method:'POST',body:'x'.repeat(262145),headers:{'content-length':'1'}}));
  assert.equal(response.status,413);assert.equal(f.calls.some(call=>call[0]==='checkout'),false);
});
test('persistent user/action rates stop the sixth hourly Checkout before payment execution',async()=>{
  const f=harness();const statuses=[];
  for(let i=0;i<6;i++)statuses.push((await f.handler(f.request('checkout',{method:'POST',body:{requestId:`fixture-${i}`}}))).status);
  assert.deepEqual(statuses,[200,200,200,200,200,429]);assert.equal(f.calls.filter(call=>call[0]==='checkout').length,5);
  assert.ok([...f.store.data.keys()].every(key=>key.startsWith('siteMembershipRateLimits/')));
});
test('Checkout forwards canonical discount input and live routes verify real mailbox routing first',async()=>{
  const f=harness({env:{...env,STRIPE_SECRET_KEY:['rk','live','fixture12345678901234567890'].join('_'),MEMBERSHIP_SALES_ENABLED:'true'}});
  assert.equal((await f.handler(f.request('checkout',{method:'POST',body:{requestId:'fixture',discountCode:'HELLO'}}))).status,200);
  assert.ok(f.calls.findIndex(call=>call[0]==='routing')<f.calls.findIndex(call=>call[0]==='checkout'));
  assert.deepEqual(f.calls.find(call=>call[0]==='checkout')[2],{requestId:'fixture',promotionCode:'HELLO'});
  const blocked=harness({env:{...env,STRIPE_SECRET_KEY:['rk','live','fixture12345678901234567890'].join('_'),MEMBERSHIP_SALES_ENABLED:'true'},checkMailRouting:async()=>{throw new MembershipError('MAIL_NOT_READY');}});
  assert.equal((await blocked.handler(blocked.request('checkout',{method:'POST',body:{}}))).status,503);
  assert.equal(blocked.calls.some(call=>call[0]==='checkout'),false);
});
test('webhook transport preserves exact bytes without Origin/auth, requires a signature, and rejects pre-parsed bodies',async()=>{
  const f=harness(),body=' { "nested": [1, 2], "text": "ภาษาไทย" }\n';
  const request=new Request('https://taithai.app/api/membership-webhook',{method:'POST',body,headers:{'stripe-signature':'signature_fixture'}});
  assert.equal((await f.webhook(request)).status,200);
  const input=f.calls.find(call=>call[0]==='webhook')[1];assert.ok(Buffer.isBuffer(input.rawBody));assert.deepEqual(input.rawBody,Buffer.from(body));
  assert.equal(f.calls.some(call=>call[0]==='auth'),false);
  assert.equal((await f.webhook(new Request('https://taithai.app/api/membership-webhook',{method:'POST',body:'{}'}))).status,400);
  await assert.rejects(readMembershipBody({body:{id:'parsed'}},{raw:true}),error=>error.code==='WEBHOOK_RAW_BODY_REQUIRED');
});
test('server failures return sanitized error codes/messages without provider details or keys',async()=>{
  const f=harness();f.runtime.billing.portal=async()=>{throw new Error('Provider secret leaked_value fixture_private');};
  const response=await result(await f.handler(f.request('portal',{method:'POST',body:{}})));
  assert.equal(response.status,503);assert.equal(response.body.error.code,'SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(response.body).includes('leaked_value'),false);assert.equal('stack'in response.body,false);
});
test('test billing paths, transactions and locks cannot write live membership/payment collections',async()=>{
  const store=memory(),sandbox=membershipBillingStore(store,{testMode:true});
  await sandbox.set('siteMemberships/member_1',{paid:true});await sandbox.create('siteBillingInvoices/in_1',{paid:true});
  await sandbox.transaction(async tx=>{assert.equal((await tx.get('siteMemberships/member_1')).paid,true);tx.set('siteBillingEvents/evt_1',{done:true});});
  await sandbox.runTransaction(async tx=>{await tx.get('siteBillingInvoices/in_1');tx.delete('siteBillingInvoices/in_1');});
  await sandbox.withLock('member_1',async()=>{});await sandbox.list('siteBillingEvents');
  await sandbox.set('siteMailboxes/member_1',{address:'real@taithai.app'});
  assert.equal(await store.get('siteMemberships/member_1'),null);
  assert.equal((await store.get('siteTestMemberships/member_1')).paid,true);
  assert.equal((await store.get('siteTestBillingEvents/evt_1')).done,true);
  assert.ok(store.keys.some(([kind,key])=>kind==='lock'&&key==='test:member_1'));
  assert.ok(store.keys.some(([kind,key])=>kind==='list'&&key==='siteTestBillingEvents'));
  assert.equal((await store.get('siteMailboxes/member_1')).address,'real@taithai.app');
  assert.equal(membershipBillingStore(store,{testMode:false}),store);
});
test('live mailbox routing rejects old MX, extra MX and failed DNS without any external request',async()=>{
  const config={mailReady:true},provider={assertReady:async()=>true};
  const valid=async()=>[{exchange:'aspmx1.migadu.com.'},{exchange:'ASPMX2.MIGADU.COM'}];
  await assertMembershipMailRouting({config,provider,resolve:valid});
  for(const records of [[{exchange:'smtp.secureserver.net'}],[{exchange:'aspmx1.migadu.com'},{exchange:'aspmx2.migadu.com'},{exchange:'other.example'}]]){
    await assert.rejects(assertMembershipMailRouting({config,provider,resolve:async()=>records}),error=>error.code==='MAIL_NOT_READY');
  }
  await assert.rejects(assertMembershipMailRouting({config,provider,resolve:async()=>{throw Error('DNS secret');}}),error=>error.code==='MAIL_NOT_READY');
  for(const check of [async()=>false,async()=>{throw Error('provider credentials detail');}]){
    await assert.rejects(assertMembershipMailRouting({config,provider:{assertReady:check},resolve:valid}),error=>error.code==='MAIL_NOT_READY');
  }
  await assert.rejects(assertMembershipMailRouting({config,resolve:valid}),error=>error.code==='MAIL_NOT_READY');
  const testConfig=membershipConfig(env);assert.equal(testConfig.testMode,true);assert.equal(testConfig.liveMode,false);
});
test('real mail entitlement requires live mode, exact plan, paid current expiry and no risk hold',()=>{
  const now=Date.UTC(2026,10,21),record={active:true,paid:true,livemode:true,planId:'mailbox-99',amount:9900,currency:'thb',mailboxes:1,currentPeriodEnd:new Date(now+86400000).toISOString()};
  assert.equal(liveMailMembership(record,{liveMode:true},now),record);
  const rejected=[null,{},...[
    {active:false},{paid:false},{livemode:false},{livemode:undefined},{planId:'other'},{amount:9901},
    {currency:'usd'},{mailboxes:0},{mailboxes:2.5},{mailboxes:Number.MAX_SAFE_INTEGER+1},{mailboxes:'2'},{quantity:2},{currentPeriodEnd:null},{currentPeriodEnd:undefined},
    {currentPeriodEnd:'invalid'},{currentPeriodEnd:new Date(now).toISOString()},{riskBlocked:true},
  ].map(patch=>({...record,...patch}))];
  for(const value of rejected)assert.deepEqual(liveMailMembership(value,{liveMode:true},now),{active:false,paid:false});
  assert.deepEqual(liveMailMembership(record,{liveMode:false},now),{active:false,paid:false});
  assert.deepEqual(liveMailMembership(record,{},now),{active:false,paid:false});
});
test('unconfigured owner setup fallback exposes safe checks only and never enables mutations or initializes Firebase',async()=>{
  const verified=[];
  const f=harness({env:{...env,FIREBASE_SERVICE_ACCOUNT_JSON:''},verifyUnconfiguredOwner:async authorization=>{
    verified.push(authorization);if(authorization!==`Bearer ${tokens.owner}`)throw new MembershipError('OWNER_REQUIRED',403);
  }});
  for(const action of ['admin-status','admin-discounts']){
    const response=await result(await f.handler(f.request(action,{token:tokens.owner})));
    assert.equal(response.status,200);assert.equal(response.body.ready,false);assert.equal(response.body.checks.database,false);
    assert.deepEqual(response.body.discounts,[]);assert.equal(JSON.stringify(response.body).includes(env.STRIPE_WEBHOOK_SECRET),false);
    assert.equal((await f.handler(f.request(action))).status,403);
  }
  assert.equal((await f.handler(f.request('admin-discount-create',{method:'POST',token:tokens.owner,body:{}}))).status,503);
  assert.equal(f.runtimeCalls(),0);assert.equal(f.calls.length,0);assert.equal(verified.length,4);
});


test('live mail trials do not open public checkout without the independent sales flag',async()=>{
  const f=harness({env:{...env,STRIPE_SECRET_KEY:['rk','live','fixture12345678901234567890'].join('_')}});
  f.runtime.mail.status=async()=>({ready:true,ownerTrial:true,mailboxes:[],canCreate:true,canSend:true});
  const status=await result(await f.handler(f.request('status',{token:tokens.owner})));
  assert.equal(status.body.ownerTrial,true);assert.equal(status.body.mailReady,true);
  assert.equal(status.body.membership.paid,false);assert.equal(status.body.ready,false);
  assert.equal(status.body.capabilities.checkout,false);assert.equal(status.body.capabilities.mail,true);
  assert.equal(status.body.canCreate,true);
  const checkout=await result(await f.handler(f.request('checkout',{method:'POST',token:tokens.owner,body:{requestId:'owner_trial_fixture'}})));
  assert.equal(checkout.status,503);assert.equal(checkout.body.error.code,'SALES_NOT_OPEN');
  assert.equal(f.calls.some(item=>['routing','checkout'].includes(item[0])),false);
  assert.equal(membershipConfig({}).salesEnabled,false);
});
test('owner trial requires trusted verified identity, correct provider and an explicit short expiry',async()=>{
  const now=Date.UTC(2026,10,21),expiresAt=new Date(now+7*86400000).toISOString();
  const config={ownerTrialEnabled:true,ownerTrialExpiresAt:expiresAt,mailReady:true,mailProvider:'purelymail',liveMode:false};
  assert.equal(ownerMailTrialAllowed(owner,config,now),true);
  for(const user of [null,member,{...owner,email_verified:false},{...owner,email:'taithai5002@gmail.com.evil.test'}])assert.equal(ownerMailTrialAllowed(user,config,now),false);
  for(const patch of [{ownerTrialEnabled:false},{mailReady:false},{mailProvider:'migadu'},{ownerTrialExpiresAt:null},{ownerTrialExpiresAt:new Date(now).toISOString()},{ownerTrialExpiresAt:new Date(now+32*86400000).toISOString()}])assert.equal(ownerMailTrialAllowed(owner,{...config,...patch},now),false);
  assert.equal(ownerMailTrialAllowed(owner,config,now+7*86400000),false);
  const store=memory(),getMembership=membershipMailEntitlement({store,config,now:()=>now});
  assert.deepEqual(await getMembership(owner.uid,{user:owner}),{active:true,paid:false,ownerTrial:true,expiresAt,mailboxes:1});
  for(const [uid,context] of [[owner.uid,undefined],[member.uid,{user:owner}],[owner.uid,{user:{...owner,email_verified:false}}],[member.uid,{user:member}]])assert.deepEqual(await getMembership(uid,context),{active:false,paid:false});
  assert.equal(store.data.size,0);
});
test('Purelymail checkout routing requires its single official MX and never accepts provider mixing',async()=>{
  const config={mailReady:true,mailProvider:'purelymail'},provider={assertReady:async()=>true};
  await assertMembershipMailRouting({config,provider,resolve:async()=>[{exchange:'MAILSERVER.PURELYMAIL.COM.'}]});
  for(const hosts of [['aspmx1.migadu.com','aspmx2.migadu.com'],['mailserver.purelymail.com','smtp.secureserver.net'],['purelymail.com'],[]])await assert.rejects(assertMembershipMailRouting({config,provider,resolve:async()=>hosts.map(exchange=>({exchange}))}),error=>error.code==='MAIL_NOT_READY');
  await assert.rejects(assertMembershipMailRouting({config:{...config,mailProvider:'unknown'},provider,resolve:async()=>[{exchange:'mailserver.purelymail.com'}]}),error=>error.code==='MAIL_NOT_READY');
});

test('preview trial writes require an exact configured origin and the verified owner, never permit billing mutations',async()=>{
  const trialOrigin='https://taithai-owner-trial.netlify.app';
  const trialEnv={...env,MAIL_PROVIDER:'purelymail',MAIL_DOMAIN:'taithai.app',MAIL_READY:'true',PURELYMAIL_API_TOKEN:'purelymail_fixture_token',MAIL_CREDENTIAL_SECRET:Buffer.alloc(32,3).toString('base64'),OWNER_MAIL_TRIAL_ENABLED:'true',OWNER_MAIL_TRIAL_EXPIRES_AT:new Date(Date.now()+7*86400000).toISOString(),OWNER_MAIL_TRIAL_ORIGIN:trialOrigin};
  const f=harness({env:trialEnv});
  const request=(action,options={})=>f.request(action,{method:'POST',body:{},token:tokens.owner,origin:trialOrigin,url:`${trialOrigin}/api/membership/?action=${action}`,...options});
  assert.equal((await f.handler(request('send'))).status,200);
  assert.equal((await f.handler(request('mailbox-create'))).status,200);
  assert.equal((await f.handler(request('send',{token:tokens.member}))).status,403);
  for(const action of ['checkout','quantity-update','portal','admin-discount-create','admin-discount-disable'])assert.equal((await f.handler(request(action))).status,403);
  assert.equal((await f.handler(request('send',{origin:'https://other-site.netlify.app'}))).status,403);
  assert.equal((await f.handler(request('send',{url:'https://other-site.netlify.app/api/membership/?action=send'}))).status,403);
  const disabled=harness({env:{...trialEnv,OWNER_MAIL_TRIAL_ENABLED:'false'}});
  assert.equal((await disabled.handler(request('send'))).status,403);
  for(const value of ['*','https://*.netlify.app','https://taithai-owner-trial.netlify.app/path','http://taithai-owner-trial.netlify.app','https://taithai-owner-trial.netlify.app.evil.test'])assert.equal(membershipConfig({...trialEnv,OWNER_MAIL_TRIAL_ORIGIN:value}).ownerTrialOrigin,null);
});


test('quantity increases use the same live sales, origin, routing and hourly limits as first checkout',async()=>{
  const live={...env,STRIPE_SECRET_KEY:['rk','live','fixture12345678901234567890'].join('_')};
  const closed=harness({env:live});
  assert.equal((await closed.handler(closed.request('quantity-update',{method:'POST',body:{quantity:2,requestId:'request_quantity_123456789'}}))).status,503);
  assert.equal(closed.calls.some(item=>item[0]==='quantity-update'),false);
  const f=harness({env:{...live,MEMBERSHIP_SALES_ENABLED:'true'}});
  const data={quantity:2,requestId:'request_quantity_123456789'};
  assert.equal((await f.handler(f.request('quantity-update',{method:'POST',body:data,origin:'https://evil.example'}))).status,403);
  for(let i=0;i<5;i++)assert.equal((await f.handler(f.request('quantity-update',{method:'POST',body:{...data,requestId:data.requestId+i}}))).status,200);
  assert.equal((await f.handler(f.request('quantity-update',{method:'POST',body:data}))).status,429);
  assert.equal(f.calls.filter(item=>item[0]==='quantity-update').length,5);
  assert.ok(f.calls.findIndex(item=>item[0]==='routing')<f.calls.findIndex(item=>item[0]==='quantity-update'));
  assert.equal(f.calls.find(item=>item[0]==='quantity-update')[2].quantity,2);
});
test('status exposes confirmed per-mailbox pricing and tenant mailbox selection without opening closed sales',async()=>{
  const f=harness({env:{...env,STRIPE_SECRET_KEY:['rk','live','fixture12345678901234567890'].join('_')}});
  f.runtime.billing.getStatus=async()=>({ready:true,quantity:2,unitAmount:9900,totalAmount:19800,mailboxLimit:2,quantityUpdateAvailable:true,membership:{active:true,paid:true,mailboxes:2},checkoutAvailable:true});
  f.runtime.mail.status=async()=>({ready:true,mailboxes:[{id:'member_1',address:'one@taithai.app',canSend:true}],pendingMailboxes:[{id:'mbx_second',address:'two@taithai.app',status:'provisioning'}],mailboxCapacity:2,mailboxUsed:2,canCreate:false,canSend:true,canManageMessages:true});
  const response=await result(await f.handler(f.request('status')));
  assert.equal(response.body.quantity,2);assert.equal(response.body.totalAmount,19800);assert.equal(response.body.unitAmount,9900);
  assert.equal(response.body.mailboxCapacity,2);assert.equal(response.body.mailboxUsed,2);assert.equal(response.body.pendingMailboxes[0].id,'mbx_second');
  assert.equal(response.body.quantityUpdateAvailable,false);assert.equal(response.body.capabilities.checkout,false);assert.equal(response.body.capabilities.mail,true);
  await f.handler(f.request('message',{url:'https://taithai.app/api/membership/?action=message&mailboxId=mbx_second&id=bound_message'}));
  assert.equal(f.calls.find(item=>item[0]==='message')[2].mailboxId,'mbx_second');
});
test('paid multiple-mailbox proof accepts exact bounded quantities and rejects mismatched current/purchased units',()=>{
  const now=Date.UTC(2026,10,21),record={active:true,paid:true,livemode:true,planId:'mailbox-99',amount:9900,currency:'thb',currentPeriodEnd:new Date(now+86400000).toISOString()};
  for(const quantity of [1,2,20,21,75]){
    const paid={...record,mailboxes:quantity,quantity};assert.equal(liveMailMembership(paid,{liveMode:true},now),paid);
    assert.deepEqual(liveMailMembership({...paid,quantity:quantity+1},{liveMode:true},now),{active:false,paid:false});
  }
});
test('Hostinger live routing and optional owner trial capacity remain independent from paid entitlement',async()=>{
  await assertMembershipMailRouting({config:{mailReady:true,mailProvider:'hostinger'},provider:{assertReady:async()=>true},resolve:async()=>[{exchange:'mx1.hostinger.com'},{exchange:'MX2.HOSTINGER.COM.'}]});
  await assert.rejects(assertMembershipMailRouting({config:{mailReady:true,mailProvider:'hostinger'},provider:{assertReady:async()=>true},resolve:async()=>[{exchange:'smtp.secureserver.net'},{exchange:'mailstore1.secureserver.net'}]}),error=>error.code==='MAIL_NOT_READY');
  const now=Date.UTC(2026,10,21),config={ownerTrialEnabled:true,ownerTrialExpiresAt:new Date(now+86400000).toISOString(),ownerTrialMailboxes:2,mailReady:true,mailProvider:'hostinger',liveMode:false};
  const getMembership=membershipMailEntitlement({store:memory(),config,now:()=>now});
  const trial=await getMembership(owner.uid,{user:owner});assert.equal(trial.mailboxes,2);assert.equal(trial.ownerTrial,true);assert.equal(trial.paid,false);
  assert.deepEqual(await getMembership(member.uid,{user:member}),{active:false,paid:false});
});
