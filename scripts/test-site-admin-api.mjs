import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminAccess, ADMIN_PERMISSIONS } from '../server-lib/site-admin-access.js';
import { createAdminData } from '../server-lib/site-admin-data.js';
import { createSiteAdminHandler } from '../server-lib/site-admin-router.js';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';

const owner = {uid:'owner-uid',email:'taithai5002@gmail.com',email_verified:true};
const delegate = {uid:'delegate-uid',email:'delegate@example.com',email_verified:true};
const outsider = {uid:'outsider-uid',email:'outsider@example.com',email_verified:true};
const now = new Date('2026-11-21T00:00:00.000Z');
const ids = [...Array(30)].map((_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
function memoryStore() {
  let state = new Map(); const writes=[];
  const read = (map,path)=>structuredClone(map.get(path) ?? null);
  const operations = map=>({get:async path=>read(map,path),set:(path,value)=>{map.set(path,structuredClone(value));writes.push(path);},
    create:(path,value)=>{if(map.has(path))throw Error('already exists');map.set(path,structuredClone(value));writes.push(path);},delete:path=>map.delete(path)});
  const store = {...operations(state),
    async transaction(fn) { const draft = new Map(structuredClone([...state])); const result=await fn(operations(draft));state=draft;Object.assign(store,operations(state));return result; },
    async list(collection,{where=[],limit=100,orderBy=[],startAfter}={}) {
      let rows=[...state].filter(([key])=>key.startsWith(collection+'/') && key.split('/').length===2).map(([key,value])=>({...structuredClone(value),id:key.split('/')[1]}));
      const comparable=value=>value instanceof Date?value.getTime():value;
      rows=rows.filter(row=>where.every(([field,operator,value])=>operator==='=='?row[field]===value:operator==='>='?comparable(row[field])>=comparable(value):comparable(row[field])<=comparable(value)));
      const orders=Array.isArray(orderBy[0])?orderBy:[orderBy];
      const values=row=>orders.map(([field])=>field==='__name__'?row.id:row[field]);
      const compare=(a,b)=>{for(let i=0;i<orders.length;i++){const aa=comparable(a[i]),bb=comparable(b[i]);if(aa!==bb)return(aa<bb?-1:1)*(orders[i][1]==='desc'?-1:1);}return 0;};
      rows.sort((a,b)=>compare(values(a),values(b)));if(startAfter)rows=rows.filter(row=>compare(values(row),startAfter)>0);
      return rows.slice(0,limit);
    },writes, dump:()=>structuredClone([...state])};
  return store;
}
function fixture() {
  const store=memoryStore(), lookups=[];
  const auth={async getUserByEmail(email){lookups.push(email);if(email==='unknown@example.com')throw Object.assign(Error(),{code:'auth/user-not-found'});
    return {uid:email==='delegate@example.com'?delegate.uid:email==='other@example.com'?'other-uid':'invalid-uid',email,emailVerified:email!=='unverified@example.com',disabled:email==='disabled@example.com',displayName:'Delegate'};}};
  const access=createAdminAccess({store,auth,now:()=>now});
  const data=createAdminData({store,access,now:()=>now});
  return {store,auth,access,data,lookups};
}
async function grant(f,permissions=['dashboard','mail'],requestId=ids[0]) { return f.access.setAdmin(owner,{email:delegate.email,permissions,requestId}); }
const rejectsCode=(work,code)=>assert.rejects(work,error=>error.code===code);
const report=(extra={})=>({app:'site',type:'bug',subject:'Problem with app',description:'A detailed problem description',steps:'',expected:'',contact:'',ownerUid:outsider.uid,ownerEmail:outsider.email,ownerName:'Visitor',status:'open',publicReply:'',createdAt:now,updatedAt:now,...extra});

test('only verified immutable owner receives owner authority; spoofed flags are ignored',async()=>{
  const f=fixture();const own=await f.access.resolveAccess(owner);assert.equal(own.canManageAdmins,true);assert.deepEqual(own.permissions,ADMIN_PERMISSIONS);
  for(const user of [null,{...owner,email_verified:false},{...owner,uid:''},{...outsider,ownerAccess:true,adminAccess:true,permissions:ADMIN_PERMISSIONS},{...owner,email:'evil@taithai5002@gmail.com'}]) {
    const access=await f.access.resolveAccess(user);assert.equal(access.adminAccess,false);assert.equal(access.mailAccess,false);
  }
  await rejectsCode(()=>f.access.setAdmin(outsider,{email:delegate.email,requestId:ids[0]}),'OWNER_REQUIRED');
  await rejectsCode(()=>f.access.setAdmin(owner,{email:owner.email,requestId:ids[0]}),'OWNER_IMMUTABLE');
  await rejectsCode(()=>f.access.revokeAdmin(owner,{uid:owner.uid,requestId:ids[0]}),'OWNER_IMMUTABLE');
});
test('grants bind exact existing UID and verified email, and revocation applies to the next lookup',async()=>{
  const f=fixture();await grant(f);
  const role=await f.access.resolveAccess(delegate);assert.equal(role.adminAccess,true);assert.equal(role.ownerAccess,false);assert.equal(role.mailAccess,true);assert.equal(role.canManageAdmins,false);
  for(const user of [{...delegate,email_verified:false},{...delegate,uid:outsider.uid},{...delegate,email:outsider.email}])assert.equal((await f.access.resolveAccess(user)).adminAccess,false);
  await f.store.set(`siteAdminGrants/${delegate.uid}`,{...(await f.store.get(`siteAdminGrants/${delegate.uid}`)),uid:'wrong-uid'});
  assert.equal((await f.access.resolveAccess(delegate)).adminAccess,false);
  await grant(f,['dashboard','mail'],ids[1]);
  await f.access.revokeAdmin(owner,{uid:delegate.uid,requestId:ids[2]});assert.equal((await f.access.resolveAccess(delegate)).mailAccess,false);
});
test('capabilities permit explicit mail-only/dashboard-only and reject inconsistent escalation',async()=>{
  const f=fixture();await grant(f,['mail']);let role=await f.access.resolveAccess(delegate);assert.equal(role.mailAccess,true);assert.equal(role.dashboardAccess,false);
  await rejectsCode(()=>f.data.listEvents(delegate),'ADMIN_PERMISSION_REQUIRED');
  await grant(f,['dashboard'],ids[1]);role=await f.access.resolveAccess(delegate);assert.equal(role.mailAccess,false);assert.equal(role.dashboardAccess,true);
  for(const permissions of [[],['mail','reports_manage'],['apps_manage'],['dashboard','root'],['mail','mail']])await rejectsCode(()=>f.access.setAdmin(owner,{email:delegate.email,permissions,requestId:ids[2]}),'INVALID_ADMIN_PERMISSIONS');
  await rejectsCode(()=>f.access.setAdmin(delegate,{email:'other@example.com',requestId:ids[2]}),'OWNER_REQUIRED');
  await rejectsCode(()=>f.access.listAdmins(delegate),'OWNER_REQUIRED');
  await rejectsCode(()=>f.access.revokeAdmin(delegate,{uid:outsider.uid,requestId:ids[2]}),'OWNER_REQUIRED');
});
test('unknown, unverified, disabled and mismatched targets never create a grant or invitation',async()=>{
  const f=fixture();for(const [email,code] of [['unknown@example.com','ACCOUNT_MUST_SIGN_IN_FIRST'],['unverified@example.com','VERIFIED_ACTIVE_ACCOUNT_REQUIRED'],['disabled@example.com','VERIFIED_ACTIVE_ACCOUNT_REQUIRED']])await rejectsCode(()=>f.access.setAdmin(owner,{email,requestId:ids[0]}),code);
  assert.equal(f.store.dump().length,0);
  f.auth.getUserByEmail=async()=>({uid:delegate.uid,email:outsider.email,emailVerified:true});
  await rejectsCode(()=>f.access.setAdmin(owner,{email:delegate.email,requestId:ids[0]}),'VERIFIED_ACTIVE_ACCOUNT_REQUIRED');
});
test('grant/revoke retry receipts and immutable audits are atomic and reject changed request contents',async()=>{
  const f=fixture();const first=await grant(f);const retry=await grant(f);assert.equal(retry.replayed,true);assert.deepEqual(retry.admin,first.admin);assert.equal(f.lookups.length,1);
  await rejectsCode(()=>grant(f,['dashboard'],ids[0]),'REQUEST_ID_REUSED');
  assert.equal((await f.store.list('siteAdminGrantAudit')).length,1);
  await f.access.revokeAdmin(owner,{uid:delegate.uid,requestId:ids[1]});const again=await f.access.revokeAdmin(owner,{uid:delegate.uid,requestId:ids[1]});assert.equal(again.replayed,true);
  assert.equal((await f.store.list('siteAdminGrantAudit')).length,2);
  assert.equal((await f.access.listAdmins(owner)).items[0].active,false);
  await rejectsCode(()=>grant(f,['mail'],'not-a-uuid'),'INVALID_REQUEST_ID');
});
test('default dashboard capability reads only allowlisted reports/events, never personal app or mail stores',async()=>{
  const f=fixture();await grant(f);await f.store.set('siteReports/report-00000001',report({secretProviderToken:'must not escape'}));
  await f.store.set('siteEvents/event-000000001',{eventId:'event-000000001',name:'page_view',actorUid:outsider.uid,createdAt:now,privateKey:'must not escape'});
  assert.equal((await f.data.listReports(delegate)).items[0].secretProviderToken,undefined);
  assert.equal((await f.data.listEvents(delegate)).items[0].privateKey,undefined);
  for(const input of [{collection:'siteMailboxes'},{uid:outsider.uid},{path:'users/other'}])await rejectsCode(()=>f.data.listEvents(delegate,input),'INVALID_REQUEST');
  await rejectsCode(()=>f.data.getReport(outsider,'report-00000001'),'ADMIN_PERMISSION_REQUIRED');
  await rejectsCode(()=>f.data.getReport(delegate,'../siteMailboxes'),'INVALID_REPORT_ID');
  await rejectsCode(()=>f.data.updateReport(delegate,{id:'report-00000001',changes:{status:'resolved'},requestId:ids[1]}),'ADMIN_PERMISSION_REQUIRED');
});
test('report writes require explicit capability and preserve report/audit atomicity with retry and conflict handling',async()=>{
  const f=fixture();await grant(f,['dashboard','reports_manage']);await f.store.set('siteReports/report-00000001',report());
  const input={id:'report-00000001',changes:{status:'resolved',publicReply:'Fixed now'},expectedUpdatedAt:now.toISOString(),requestId:ids[1]};
  const result=await f.data.updateReport(delegate,input);assert.equal(result.ownerUid,outsider.uid);assert.equal(result.status,'resolved');assert.equal((await f.store.list('siteAdminAudit')).length,1);
  assert.equal((await f.data.updateReport(delegate,input)).replayed,true);assert.equal((await f.store.list('siteAdminAudit')).length,1);
  await rejectsCode(()=>f.data.updateReport(delegate,{...input,changes:{status:'closed'}}),'REQUEST_ID_REUSED');
  await rejectsCode(()=>f.data.updateReport(delegate,{...input,requestId:ids[2],expectedUpdatedAt:'2020-01-01T00:00:00Z'}),'REPORT_CONFLICT');
  for(const changes of [{ownerUid:delegate.uid},{publicReply:'\u0000'},{status:'arbitrary'},{}])await rejectsCode(()=>f.data.updateReport(delegate,{id:input.id,changes,requestId:ids[3]}),changes.ownerUid?'INVALID_REQUEST':'INVALID_REPORT');
  assert.equal((await f.store.get('siteReports/'+input.id)).ownerUid,outsider.uid);
});
test('app changes require explicit capability, full fixed map, locked Private Drive and current revision plus audit',async()=>{
  const f=fixture();await grant(f);const defaults=normalizeAppSettings(null);
  await rejectsCode(()=>f.data.updateAppSettings(delegate,{apps:defaults.apps,expectedRevision:0,requestId:ids[1]}),'ADMIN_PERMISSION_REQUIRED');
  await grant(f,['dashboard','apps_manage'],ids[2]);
  const apps=structuredClone(defaults.apps);apps['movie-memory'].visibility='unlisted';
  const result=await f.data.updateAppSettings(delegate,{apps,expectedRevision:0,requestId:ids[3]});assert.equal(result.revision,1);assert.equal(result.apps['movie-memory'].visibility,'unlisted');
  assert.equal((await f.store.list('siteAppVisibilityAudit'))[0].actorUid,delegate.uid);
  assert.equal((await f.data.updateAppSettings(delegate,{apps,expectedRevision:0,requestId:ids[3]})).replayed,true);
  await rejectsCode(()=>f.data.updateAppSettings(delegate,{apps,expectedRevision:0,requestId:ids[4]}),'APP_SETTINGS_CONFLICT');
  apps['private-drive'].visibility='public';await rejectsCode(()=>f.data.updateAppSettings(delegate,{apps,expectedRevision:1,requestId:ids[5]}),'INVALID_APP_CONFIG');
  assert.equal((await f.store.get('siteConfig/appVisibility')).apps['private-drive'].visibility,'private');
});
test('capability is re-read inside write transaction, so revoke between initial guard and write wins',async()=>{
  const f=fixture();await grant(f,['dashboard','reports_manage']);await f.store.set('siteReports/report-00000001',report());
  const original=f.access.resolveAccess;let calls=0;
  const access={...f.access,async resolveAccess(user,options){calls++;if(calls===2)await f.store.set(`siteAdminGrants/${delegate.uid}`,{...(await f.store.get(`siteAdminGrants/${delegate.uid}`)),active:false});return original(user,options);}};
  const data=createAdminData({store:f.store,access,now:()=>now});
  // Simulate a real Firestore transaction reading the revoked record; the fake transaction
  // snapshots before its callback, so revoke immediately before entering it instead.
  const tx=f.store.transaction.bind(f.store);f.store.transaction=async work=>{await f.store.set(`siteAdminGrants/${delegate.uid}`,{...(await f.store.get(`siteAdminGrants/${delegate.uid}`)),active:false});return tx(work);};
  await rejectsCode(()=>data.updateReport(delegate,{id:'report-00000001',changes:{status:'closed'},requestId:ids[1]}),'ADMIN_PERMISSION_REQUIRED');
  assert.equal((await f.store.get('siteReports/report-00000001')).status,'open');assert.equal((await f.store.list('siteAdminAudit')).length,0);
});
test('cursor includes query scope, stable timestamp/id tie-break and bounded list limits',async()=>{
  const f=fixture();await grant(f);for(let i=1;i<4;i++)await f.store.set('siteReports/report-0000000'+i,report());
  const first=await f.data.listReports(delegate,{limit:2});assert.deepEqual(first.items.map(r=>r.id),['report-00000003','report-00000002']);
  const second=await f.data.listReports(delegate,{limit:2,cursor:first.nextCursor});assert.deepEqual(second.items.map(r=>r.id),['report-00000001']);assert.equal(second.nextCursor,null);
  await rejectsCode(()=>f.data.listReports(delegate,{status:'closed',cursor:first.nextCursor}),'INVALID_CURSOR');
  await rejectsCode(()=>f.data.listEvents(delegate,{cursor:first.nextCursor}),'INVALID_CURSOR');
  for(const limit of [0,501,-1,1.2])await rejectsCode(()=>f.data.listEvents(delegate,{limit}),'INVALID_QUERY');
});
function request(action, {method='GET',origin='https://taithai.app',token='fixture_token_at_least_20_characters',body,extraHeaders={}}={}) {
  return new Request('https://taithai-app.netlify.app/api/site-admin/?action='+action,{method,headers:{...(origin?{origin}:{}),...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...extraHeaders},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
function handlerFixture(f=fixture(),user=owner) {
  const verified=[];f.auth.verifyIdToken=async(token,checkRevoked)=>{verified.push({token,checkRevoked});if(token.includes('revoked'))throw Error('secret detail');return user;};
  return {f,verified,handler:createSiteAdminHandler({getRuntime:()=>f,rate:async()=>{}})};
}
test('API checks revoked Firebase tokens and never trusts submitted owner/admin flags',async()=>{
  const {handler,verified}=handlerFixture(fixture(),outsider);
  const response=await handler(request('access'));assert.equal(response.status,200);assert.equal((await response.json()).adminAccess,false);assert.equal(verified[0].checkRevoked,true);
  assert.equal((await handler(request('admins'))).status,403);
  assert.equal((await handler(request('access',{token:'revoked_fixture_token_at_least_20_characters'}))).status,401);
  assert.equal((await handler(request('access',{token:null}))).status,401);
  const unverified=handlerFixture(fixture(),{...owner,email_verified:false});assert.equal((await unverified.handler(request('access'))).status,403);
});
test('API exact-origin CORS supports both sites and rejects missing write/foreign/null/subdomain origins before store IO',async()=>{
  const {handler,verified}=handlerFixture();
  for(const origin of ['https://taithai.app','https://taithai-app.netlify.app']){
    const result=await handler(request('access',{origin}));assert.equal(result.headers.get('access-control-allow-origin'),origin);assert.match(result.headers.get('cache-control'),/no-store/);
    const options=await handler(request('access',{method:'OPTIONS',origin,token:null,extraHeaders:{'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}}));assert.equal(options.status,204);
  }
  const before=verified.length;for(const origin of ['https://evil.test','null','https://taithai.app.evil.test','http://taithai.app'])assert.equal((await handler(request('access',{origin}))).status,403);
  assert.equal((await handler(request('admin-set',{method:'POST',origin:null,body:{}}))).status,403);assert.equal(verified.length,before);
});
test('API owner-managed grants and dashboard proxy work with bounded strict JSON and action allowlist',async()=>{
  const {handler,f}=handlerFixture();let response=await handler(request('admin-set',{method:'POST',body:{email:delegate.email,requestId:ids[0]}}));assert.equal(response.status,200);assert.equal((await response.json()).admin.uid,delegate.uid);
  response=await handler(request('admins'));assert.equal(response.status,200);assert.equal((await response.json()).items.length,1);
  assert.equal((await handler(request('siteMailboxes'))).status,404);
  assert.equal((await handler(request('admin-set',{method:'POST',body:'{broken'}))).status,400);
  assert.equal((await handler(request('admin-set',{method:'POST',body:'x'.repeat(32769)}))).status,413);
  assert.equal((await handler(request('admin-set',{method:'POST',body:{email:delegate.email,uid:outsider.uid,requestId:ids[1]}}))).status,400);
  assert.equal((await f.access.resolveAccess(outsider)).adminAccess,false);
});
test('API turns private exception text into generic failures without credentials or request bodies',async()=>{
  const handler=createSiteAdminHandler({getRuntime:()=>{throw Error('private credential-do-not-leak');}});
  const response=await handler(request('admins'));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/credential|do-not-leak/);
});
test('server-only roles remain caught by client deny-all; no privilege to personal ACE/Private Drive is added',async()=>{
  const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');assert.doesNotMatch(rules,/match \/siteAdminGrants/);assert.match(rules,/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
  const gate=await readFile(new URL('../server-lib/site-app-gate.js',import.meta.url),'utf8');assert.doesNotMatch(gate,/siteAdminGrants|createAdminAccess/);
});
