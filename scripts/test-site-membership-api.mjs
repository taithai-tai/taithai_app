import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembershipHandler, createMembershipWebhook, readMembershipRequest } from '../server-lib/site-membership-router.js';
import { membershipConfig, consumeMembershipRate, verifyMembershipUser, MembershipError } from '../server-lib/site-membership-core.js';
import { membershipMailEntitlement, assertMembershipMailRouting } from '../server-lib/site-membership-runtime.js';
import { createAdminAccess } from '../server-lib/site-admin-access.js';

const owner={uid:'owner_123',email:'taithai5002@gmail.com',email_verified:true};
const member={uid:'other_123',email:'other@example.com',email_verified:true,ownerAccess:true,paid:true,isOwner:true};
const delegate={uid:'delegate_123',email:'delegate@example.com',email_verified:true};
const dashboard={uid:'dashboard_123',email:'dashboard@example.com',email_verified:true};
const tokens={delegate:'delegate_token_fixture_123456789',dashboard:'dashboard_token_fixture_123456789',owner:'owner_token_fixture_123456789',member:'member_token_fixture_123456789',unverified:'unverified_fixture_123456789',revoked:'revoked_token_fixture_123456789'};
const env={NODE_ENV:'production',OWNER_MAIL_ENABLED:'true',MAIL_READY:'true',MAIL_DOMAIN:'taithai.app',MAIL_PROVIDER:'hostinger',
  HOSTINGER_API_TOKEN:'hostinger-fixture-token',HOSTINGER_MAIL_ORDER_ID:'OR_fixture',MAIL_CREDENTIAL_SECRET:Buffer.alloc(32,8).toString('base64'),
  FIREBASE_SERVICE_ACCOUNT_JSON:'{}',OWNER_MAIL_ORIGIN:'https://taithai-app.netlify.app'};
function harness(extra={}) {
  const calls=[],data=new Map([[`siteAdminGrants/${delegate.uid}`,{...delegate,active:true,permissions:['mail']}],[`siteAdminGrants/${dashboard.uid}`,{...dashboard,active:true,permissions:['dashboard']}]]),store={keys:[],async get(key){this.keys.push(['get',key]);return data.get(key)||null;},async set(key,value){this.keys.push(['set',key]);data.set(key,value);},async list(){return [];},async transaction(fn){return fn(this);}};
  let runtimeCalls=0;
  const runtime={store,auth:{async getUserByEmail(){throw Error('unused');},async verifyIdToken(token,revoked){calls.push(['auth',token,revoked]);if(token===tokens.owner)return owner;if(token===tokens.delegate)return delegate;if(token===tokens.dashboard)return dashboard;if(token===tokens.member)return member;if(token===tokens.unverified)return {...owner,email_verified:false};throw Error('revoked or invalid');}},
    mail:{async status(user){calls.push(['status',user.uid]);return {ready:true,ownerAccess:true,adminOnly:true,paid:false,ownerTrial:false,mailboxes:[],pendingMailboxes:[],mailboxCapacity:1,mailboxUsed:0,mailboxAvailable:1,capacityAvailable:true,canCreate:true,canSend:false,canManageMessages:false};},
      async folders(user,input){calls.push(['folders',user.uid,input]);return {folders:[]};},async list(user,input){calls.push(['list',user.uid,input]);return {messages:[]};},async message(user,input){calls.push(['message',user.uid,input]);return {text:'safe fixture'};},
      async create(user,input){calls.push(['create',user.uid,input]);return {adminOnly:true,ownerAccess:true,createdMailbox:{address:'fixture@taithai.app'}};},async send(user,input){calls.push(['send',user.uid,input]);return {status:'sent'};},
      async checkConnection(user,input){calls.push(['mail-connection-check',user.uid,input]);return {mailboxId:input.mailbox,smtp:{connected:true}};},async saveReceivingName(user,input){calls.push(['receiving-name-save',user.uid,input]);return {mailboxId:input.mailbox,receivingNames:[]};},async hideReceivingName(user,input){calls.push(['receiving-name-hide',user.uid,input]);return {mailboxId:input.mailbox,receivingNames:[]};},async listAliases(user,input){calls.push(['aliases',user.uid,input]);return {mailboxId:input.mailbox,aliases:[]};},async createAlias(user,input){calls.push(['alias-create',user.uid,input]);return {mailboxId:input.mailbox,aliases:[{id:'AA_new',address:'streaming@taithai.app'}]};},async deleteAlias(user,input){calls.push(['alias-delete',user.uid,input]);return {mailboxId:input.mailbox,aliases:[]};},async read(user,input){calls.push(['read',user.uid,input]);return {updated:true};},async trash(user,input){calls.push(['trash',user.uid,input]);return {updated:true};}},
    billing:new Proxy({},{get(){throw Error('Billing must never be accessed');}})};
  runtime.resolveAccess=createAdminAccess({store,auth:runtime.auth}).resolveAccess;
  const options={env,getRuntime:async()=>{runtimeCalls++;return runtime;},rate:async(store,user,scope)=>{calls.push(['rate',user.uid,scope]);},verifyUnconfiguredOwner:async authorization=>{calls.push(['setup-owner']);if(authorization!=='Bearer '+tokens.owner)throw new MembershipError('OWNER_REQUIRED',403);},...extra};
  const handler=createMembershipHandler(options);
  const request=(action,{method='GET',token=tokens.owner,body,origin='https://taithai.app',url='https://taithai.app/api/membership/'}={})=>{
    const headers={...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{}),...(body!==undefined?{'content-type':'application/json'}:{})};
    return new Request(url+'?action='+action,{method,headers,...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  };
  return {handler,request,calls,store,data,runtime,runtimeCalls:()=>runtimeCalls};
}
const json=async response=>({status:response.status,body:await response.json(),headers:response.headers});

test('public owner-mail status is private/unavailable and never initializes services or exposes billing/configuration',async()=>{
  const f=harness(),response=await json(await f.handler(f.request('status',{token:null})));
  assert.equal(response.status,200);assert.equal(response.body.adminOnly,true);assert.equal(response.body.ownerAccess,false);assert.equal(response.body.ready,false);
  assert.equal(f.runtimeCalls(),0);assert.match(response.headers.get('cache-control'),/no-store/);
  for(const key of ['unitAmount','totalAmount','quantity','expiresAt','plan','testMode'])assert.equal(Object.hasOwn(response.body,key),false,key);
  assert.equal(JSON.stringify(response.body).includes(env.HOSTINGER_API_TOKEN),false);
});
test('permanent admin entitlement reads only live grants, never paid records or trial dates',async()=>{
  const f=harness(),resolve=membershipMailEntitlement({resolveAccess:f.runtime.resolveAccess});
  for(const user of [owner,delegate]) {
    const result=await resolve(user.uid,{user});assert.equal(result.active,true);assert.equal(result.mailAccess,true);
    assert.equal(result.ownerAccess,user===owner);assert.equal(result.paid,false);assert.equal(result.ownerTrial,false);assert.equal('expiresAt' in result,false);
  }
  for(const user of [member,dashboard,{...delegate,email_verified:false},{...delegate,email:'changed@example.com'}])assert.equal((await resolve(user.uid,{user})).active,false);
  f.data.get(`siteAdminGrants/${delegate.uid}`).active=false;assert.equal((await resolve(delegate.uid,{user:delegate})).active,false);
  assert.equal((await resolve(owner.uid,{user:delegate})).active,false);
  assert.equal(f.store.keys.some(([,key])=>key.startsWith('siteMemberships/')),false);
});
test('owner status and mailboxes are ready without subscription, trial, price or Stripe credentials',async()=>{
  const f=harness();for(const action of ['status','mailboxes']){
    const response=await json(await f.handler(f.request(action)));
    assert.equal(response.status,200);assert.equal(response.body.ready,true);assert.equal(response.body.ownerAccess,true);
    assert.equal(response.body.adminOnly,true);assert.equal(response.body.paid,false);assert.equal(response.body.ownerTrial,false);
    assert.equal(response.body.membership,null);assert.equal(response.body.mailboxAvailable,1);assert.equal(response.body.canCreate,true);
    assert.deepEqual(response.body.capabilities,{checkout:false,portal:false,mail:true});
  }
  assert.equal(f.calls.some(call=>call[0]==='auth'&&call[2]===true),true);
});
test('ordinary and dashboard-only users cannot perform mail actions despite fake paid/client-admin flags',async()=>{
  for(const token of [tokens.member,tokens.dashboard])for(const [action,method,body] of [['status','GET'],['mailboxes','GET'],['folders','GET'],['messages','GET'],['message','GET'],['aliases','GET'],['mail-connection-check','POST',{mailbox:'owner_123'}],['receiving-name-save','POST',{mailbox:'owner_123',localPart:'streaming'}],['receiving-name-hide','POST',{mailbox:'owner_123',confirmAddress:'streaming@taithai.app'}],['alias-create','POST',{mailbox:'owner_123',localPart:'streaming',requestId:'fixture_alias_1234'}],['alias-delete','POST',{mailbox:'owner_123',aliasId:'AA_fixture',confirmAddress:'streaming@taithai.app',requestId:'fixture_delete_1234'}],['admin-status','GET'],['mailbox-create','POST',{localPart:'sunny'}],['send','POST',{}],['message-flags','POST',{read:true}]]){
    const f=harness(),response=await json(await f.handler(f.request(action,{method,body,token})));
    assert.equal(response.status,action==='status'?200:403,action);
    if(action==='status'){assert.equal(response.body.mailAccess,false);assert.equal('role' in response.body,false);assert.deepEqual(response.body.mailboxes,[]);}
    else assert.equal(response.body.error.code,'MAIL_ACCESS_REQUIRED',action);
    assert.equal(f.store.keys.some(([,key])=>!key.startsWith('siteAdminGrants/')),false);
    assert.equal(f.calls.some(call=>call[0]!=='auth'),false);
  }
});
test('authorized delegate mail operations stay bound to its verified UID and revocation takes effect on next request',async()=>{
  const f=harness();for(const action of ['status','mailboxes','folders','messages','message']){
    const response=await json(await f.handler(f.request(action,{token:tokens.delegate})));assert.equal(response.status,200);
    if(action==='status'){assert.equal(response.body.ownerAccess,false);assert.equal(response.body.adminAccess,true);assert.equal(response.body.mailAccess,true);assert.equal(response.body.role,'admin');}
  }
  for(const [action,body] of [['mailbox-create',{localPart:'sunny'}],['send',{}],['message-flags',{read:true}]])assert.equal((await f.handler(f.request(action,{token:tokens.delegate,method:'POST',body}))).status,200);
  assert.equal(f.calls.filter(call=>['status','folders','list','message','create','send','read','rate'].includes(call[0])).every(call=>call[1]===delegate.uid),true);
  f.data.get(`siteAdminGrants/${delegate.uid}`).active=false;
  assert.equal((await f.handler(f.request('send',{token:tokens.delegate,method:'POST',body:{}}))).status,403);
  const state=await json(await f.handler(f.request('status',{token:tokens.delegate})));assert.equal(state.body.mailAccess,false);assert.equal(state.body.mailboxes.length,0);
});
test('revoked, unverified, malformed and missing credentials never reach mail or quota writes',async()=>{
  for(const token of [tokens.unverified,tokens.revoked,'short',null]){
    const f=harness(),response=await json(await f.handler(f.request('folders',{token})));
    assert.ok([401,403].includes(response.status));assert.equal(f.store.keys.length,0);assert.equal(f.calls.some(call=>call[0]!=='auth'),false);
  }
  const access=harness().runtime.resolveAccess;
  assert.equal((await access({...owner,email:'alias+taithai5002@gmail.com'})).ownerAccess,false);
  assert.equal((await access({...member,emailVerified:true})).ownerAccess,false);
});
test('explicit owner/mail flags disable access before records and provider calls; old trial flags cannot enable it',async()=>{
  for(const patch of [{OWNER_MAIL_ENABLED:'false'},{MAIL_READY:'false'},{OWNER_MAIL_ENABLED:'false',OWNER_MAIL_TRIAL_ENABLED:'true',OWNER_MAIL_TRIAL_EXPIRES_AT:'2099-01-01T00:00:00Z'}]){
    const f=harness({env:{...env,...patch}}),response=await json(await f.handler(f.request('status')));
    assert.equal(response.body.ownerAccess,true);assert.equal(response.body.mailAccess,true);assert.equal(response.body.ready,false);assert.equal(f.calls.some(call=>call[0]!=='auth'),false);
    const denied=await json(await f.handler(f.request('mailbox-create',{method:'POST',body:{localPart:'sunny'}})));assert.equal(denied.status,503);
    assert.equal(f.store.keys.length,0);assert.equal(f.calls.some(call=>call[0]==='create'),false);
  }
});
test('all billing actions and webhook are disabled before runtime/auth regardless live/test keys and sales flags',async()=>{
  for(const mode of ['test','live'])for(const action of ['checkout','quantity-update','portal','admin-discounts','admin-discount-create','admin-discount-disable'])for(const method of ['GET','POST']){
    const f=harness({env:{...env,STRIPE_SECRET_KEY:'rk_'+mode+'_fixture123456789',STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:'fixture',MEMBERSHIP_SALES_ENABLED:'true'}});
    const response=await json(await f.handler(f.request(action,{method,token:tokens.owner,origin:null,body:method==='POST'?'not JSON':undefined})));
    assert.equal(response.status,403);assert.equal(response.body.error.code,'BILLING_DISABLED');assert.equal(f.runtimeCalls(),0);assert.equal(f.calls.length,0);
  }
  let calls=0;const webhook=createMembershipWebhook({getRuntime:()=>{calls++;throw Error('must not initialize');}});
  for(const method of ['GET','POST']){const response=await json(await webhook(new Request('https://taithai.app/api/membership-webhook/',{method,...(method==='POST'?{body:'{}',headers:{'stripe-signature':'old-valid-looking-signature'}}:{})})));assert.equal(response.status,403);assert.equal(response.body.error.code,'BILLING_DISABLED');}
  assert.equal(calls,0);assert.equal(membershipConfig({...env,MEMBERSHIP_SALES_ENABLED:'true',STRIPE_QUANTITY_UPDATES_VERIFIED:'true'}).salesEnabled,false);
});
test('permanent preview writes require exact trusted origin plus verified owner and no expiry',async()=>{
  const f=harness();const response=await json(await f.handler(f.request('mailbox-create',{method:'POST',body:{localPart:'sunny'},origin:env.OWNER_MAIL_ORIGIN,url:env.OWNER_MAIL_ORIGIN+'/api/membership/'})));
  assert.equal(response.status,200);assert.equal(f.calls.some(call=>call[0]==='create'),true);
  for(const candidate of [null,'https://evil.example','https://other.netlify.app','https://taithai-app.netlify.app.evil.example','https://taithai.app']){
    const blocked=harness(),res=await json(await blocked.handler(blocked.request('send',{method:'POST',body:{},origin:candidate,url:env.OWNER_MAIL_ORIGIN+'/api/membership/'})));
    assert.equal(res.status,403);assert.equal(res.body.error.code,'ORIGIN_NOT_ALLOWED');assert.equal(blocked.runtimeCalls(),0);
  }
  const other=harness(),denied=await json(await other.handler(other.request('send',{method:'POST',body:{},token:tokens.member,origin:env.OWNER_MAIL_ORIGIN,url:env.OWNER_MAIL_ORIGIN+'/api/membership/'})));
  assert.equal(denied.status,403);assert.equal(denied.body.error.code,'MAIL_ACCESS_REQUIRED');
});
test('owner requests retain method/JSON/body bounds and message-flag validation before writes',async()=>{
  const f=harness();assert.equal((await f.handler(new Request('https://taithai.app/api/membership/?action=status',{method:'DELETE'}))).status,405);
  assert.equal((await f.handler(f.request('unknown'))).status,404);
  assert.equal((await f.handler(f.request('send',{method:'POST',body:'not json'}))).status,400);
  assert.equal((await f.handler(f.request('message-flags',{method:'POST',body:{trash:true,read:true}}))).status,400);
  await assert.rejects(readMembershipRequest(new Request('https://taithai.app/',{method:'POST',body:'123456',headers:{'content-type':'application/json','content-length':'100'}}),{maximum:5}),error=>error.code==='REQUEST_TOO_LARGE');
  assert.equal(f.calls.some(call=>call[0]==='send'),false);
});
test('owner mail read/write dispatch stays identity-bound with existing persistent rates',async()=>{
  const f=harness();for(const action of ['folders','messages','message'])assert.equal((await f.handler(f.request(action))).status,200);
  for(const [action,body] of [['send',{}],['message-flags',{read:true}],['message-flags',{trash:true}]])assert.equal((await f.handler(f.request(action,{method:'POST',body}))).status,200);
  assert.equal(f.calls.filter(call=>call[0]==='rate').every(call=>call[1]===owner.uid),true);
  const store=harness().store;await consumeMembershipRate(store,owner,'send',{limit:1,now:1000});await assert.rejects(consumeMembershipRate(store,owner,'send',{limit:1,now:1000}),error=>error.code==='TOO_MANY_REQUESTS');
});
test('inventory unavailability preserves owner inbox access and disables only creation',async()=>{
  const f=harness();f.runtime.mail.status=async()=>({ready:true,ownerAccess:true,mailboxes:[{id:owner.uid,address:'sunny@taithai.app',canSend:true}],mailboxCapacity:0,mailboxAvailable:0,capacityAvailable:false,canCreate:false,canSend:true,canManageMessages:true});
  const response=await json(await f.handler(f.request('status')));assert.equal(response.body.ownerAccess,true);assert.equal(response.body.ready,true);assert.equal(response.body.canCreate,false);assert.equal(response.body.canSend,true);assert.equal(response.body.capacityAvailable,false);
});
test('unconfigured setup exposes only safe owner checks without initializing a private database',async()=>{
  const f=harness({env:{...env,FIREBASE_SERVICE_ACCOUNT_JSON:''}});
  const response=await json(await f.handler(f.request('admin-status')));assert.equal(response.status,200);assert.equal(response.body.checks.database,false);assert.equal(response.body.checks.payments,false);assert.equal(f.runtimeCalls(),0);
  assert.equal((await f.handler(f.request('admin-status',{token:tokens.member}))).status,403);
});
test('total request deadline includes auth and late completion cannot start mail provisioning',async()=>{
  let release;const paused=new Promise(resolve=>{release=resolve;});
  const f=harness({operationTimeoutMs:10,verifyUser:async()=>{await paused;return owner;}});
  const response=await json(await f.handler(f.request('mailbox-create',{method:'POST',body:{localPart:'sunny'}})));
  assert.equal(response.status,503);assert.equal(response.body.error.code,'OPERATION_TIMEOUT');release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.some(call=>call[0]==='create'||call[0]==='rate'),false);
});
test('owner authentication always retains Firebase revoked/disabled-token verification',async()=>{
  const f=harness();await verifyMembershipUser('Bearer '+tokens.owner,f.runtime);assert.equal(f.calls[0][2],true);
  await assert.rejects(verifyMembershipUser('Bearer '+tokens.revoked,f.runtime),error=>error.code==='AUTH_REQUIRED');
});
test('Hostinger routing preflight still rejects old or mixed MX and does not invent delivery proof',async()=>{
  const config=membershipConfig(env);let calls=0;
  const options={config,provider:{async assertReady(){calls++;return true;}}};
  await assert.rejects(assertMembershipMailRouting({...options,resolve:async()=>[{exchange:'smtp.secureserver.net'}]}),error=>error.code==='MAIL_NOT_READY');assert.equal(calls,0);
  await assertMembershipMailRouting({...options,resolve:async()=>[{exchange:'mx1.hostinger.com'},{exchange:'mx2.hostinger.com'}]});assert.equal(calls,1);
});


test('alias routes preserve verified UID, selected mailbox, private responses and the exact write origin',async()=>{
 const f=harness();const query=f.request('aliases',{token:tokens.delegate});const url=new URL(query.url);url.searchParams.set('mailbox','mbx_selected');
 const listed=await json(await f.handler(new Request(url,{headers:query.headers})));assert.equal(listed.status,200);assert.deepEqual(listed.body,{mailboxId:'mbx_selected',aliases:[]});assert.match(listed.headers.get('cache-control'),/no-store/);assert.ok(f.calls.some(c=>c[0]==='aliases'&&c[1]===delegate.uid&&c[2].mailbox==='mbx_selected'));
 for(const action of ['alias-create','alias-delete','receiving-name-save','receiving-name-hide','mail-connection-check']){const body={mailbox:'mbx_selected',localPart:'streaming',aliasId:'AA_fixture',confirmAddress:'streaming@taithai.app',requestId:'fixture_alias_123456'};const response=await f.handler(f.request(action,{token:tokens.delegate,method:'POST',body}));assert.equal(response.status,200);assert.ok(f.calls.some(c=>c[0]===action&&c[1]===delegate.uid&&c[2].mailbox==='mbx_selected'));}
 const blocked=harness();assert.equal((await blocked.handler(blocked.request('alias-create',{method:'POST',origin:'https://evil.example',body:{}}))).status,403);assert.equal(blocked.runtimeCalls(),0);
 f.data.get(`siteAdminGrants/${delegate.uid}`).active=false;const before=f.calls.filter(c=>c[0].startsWith('alias')).length;assert.equal((await f.handler(f.request('aliases',{token:tokens.delegate}))).status,403);assert.equal(f.calls.filter(c=>c[0].startsWith('alias')).length,before);
});
