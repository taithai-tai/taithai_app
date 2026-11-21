import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteAdminApi,normalizeAdminAccess} from '../assets/site-admin-api.js';
import {initAccessUI} from '../assets/site-access-ui.js';
import {createAdminRosterPanel,validateAdminGrant} from '../assets/site-admin-roster.js';

const person=(uid='admin')=>({uid,email:uid+'@example.com',emailVerified:true,getIdToken:async()=>`token-${uid}`});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));};
const grant=(patch={})=>({adminAccess:true,ownerAccess:false,dashboardAccess:true,mailAccess:true,canManageAdmins:false,canManageReports:false,canManageApps:false,role:'admin',permissions:['dashboard','mail'],...patch});

test('admin facade uses bearer requests, opaque cursors and immutable retry IDs without browser Firestore',async()=>{
  let user=person(),attempt=0;const calls=[];
  const api=createSiteAdminApi({getUser:()=>user,window:{crypto:globalThis.crypto},request:async(url,options)=>{calls.push({url,options,body:options.body&&JSON.parse(options.body)});if(options.method==='POST'&&++attempt===1)return response({error:{code:'SERVICE_UNAVAILABLE'}},503);return response(options.method==='POST'?{id:'r1',status:'resolved'}:{items:[],nextCursor:'opaque.next'});}});
  await api.listReports({status:'open',limit:50,cursor:'opaque+cursor/='});const first=calls[0];assert.equal(new URL(first.url,'https://taithai.app').searchParams.get('cursor'),'opaque+cursor/=');assert.equal(first.options.credentials,'omit');assert.equal(first.options.cache,'no-store');assert.equal(first.options.headers.Authorization,'Bearer token-admin');assert.ok(!first.url.includes('token-admin'));
  const changes={status:'resolved',publicReply:'Done'};await assert.rejects(api.updateReport('r1',changes,'2026-11-21T00:00:00.000Z'),{deliveryUnknown:true});await api.updateReport('r1',changes,'2026-11-21T00:00:00.000Z');assert.deepEqual(calls[1].body,calls[2].body);assert.equal(calls[1].body.expectedUpdatedAt,'2026-11-21T00:00:00.000Z');api.abort();
});

test('admin facade checks verified UID before and after awaits and drops late private results',async()=>{
  let user=person(),finishToken,calls=0;user.getIdToken=()=>new Promise(resolve=>{finishToken=resolve;});
  const api=createSiteAdminApi({getUser:()=>user,request:async()=>{calls++;return response(grant());}});const work=api.getAccess();user=person('other');finishToken('private-token');await assert.rejects(work,{code:'ACCOUNT_CHANGED'});assert.equal(calls,0);
  let finish;const later=createSiteAdminApi({getUser:()=>user,request:()=>new Promise(resolve=>{finish=resolve;})});const pending=later.listEvents({limit:1});await flush();user=person('third');finish(response({items:[{actorEmail:'PRIVATE'}]}));await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});user={...person(),emailVerified:false};await assert.rejects(later.getAccess(),{code:'AUTH_REQUIRED'});api.abort();later.abort();
});

test('capability normalization never treats a claimed owner flag or role label as access',()=>{
  assert.equal(normalizeAdminAccess({ownerAccess:true,mailAccess:true,dashboardAccess:true,role:'owner'}).mailAccess,false);
  assert.equal(normalizeAdminAccess(grant({mailAccess:false})).mailAccess,false);
  assert.deepEqual(normalizeAdminAccess(grant({permissions:['dashboard','root','mail']})).permissions,['dashboard','mail']);
});

test('delegated navigation waits for the server, stays capability-specific and clears on account switch or revocation',async()=>{
  const win=new EventTarget(),links={mail:{hidden:false},dashboard:{hidden:false},admin:{hidden:false}};
  win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;
  const doc={body:{dataset:{}},querySelector:()=>links.mail,querySelectorAll:selector=>selector==='[data-mail-access]'?[links.mail]:selector==='[data-dashboard-access]'?[links.dashboard]:[links.admin]};
  let notify,user=person(),finish,mode='deferred';const requests=[];
  const controller=initAccessUI({win,doc,loadAuth:async()=>({subscribeAuth(fn){notify=fn;fn(user);return()=>{};}}),request:async(url,options)=>{requests.push({url,options});if(mode==='deferred')return new Promise(resolve=>{finish=resolve;});return response(grant({dashboardAccess:false,mailAccess:mode==='mail',adminAccess:mode!=='revoked'}));}});
  await flush();assert.ok(Object.values(links).every(link=>link.hidden));finish(response(grant({dashboardAccess:false})));await flush();assert.equal(links.mail.hidden,false);assert.equal(links.dashboard.hidden,true);assert.ok(requests[0].url.startsWith('https://taithai-app.netlify.app/api/site-admin/'));assert.equal(requests[0].options.credentials,'omit');
  mode='revoked';win.dispatchEvent(new Event('focus'));await flush();assert.ok(Object.values(links).every(link=>link.hidden));mode='deferred';notify(person('next'));await flush();notify(null);finish(response(grant()));await flush();assert.ok(Object.values(links).every(link=>link.hidden));controller.destroy();
});

class Element {
  constructor(tag,doc){this.tagName=tag;this.doc=doc;this.children=[];this.listeners={};this.dataset={};this.attributes={};this._text='';this.disabled=false;this.hidden=false;this.classList={add:()=>{}};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+' '+this.children.map(child=>child.textContent).join(' ');}
  set innerHTML(_){throw Error('HTML is forbidden');}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}async fire(type){for(const fn of this.listeners[type]||[])await fn({preventDefault(){}});}focus(){this.doc.activeElement=this;}
}
function rosterFixture({owner=true,call}={}){
  const doc={};doc.createElement=tag=>new Element(tag,doc);const root=doc.createElement('div');
  const find=(predicate,node=root)=>predicate(node)?node:node.children.map(child=>find(predicate,child)).find(Boolean);
  doc.getElementById=id=>find(node=>node.id===id);const storage=new Map();let confirmed='',allow=true,user=person('owner'),writes=[];
  const win={crypto:globalThis.crypto,confirm:text=>{confirmed=text;return allow;},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
  const api={call:async(action,options={})=>{if(options.method==='POST')writes.push({action,data:structuredClone(options.data)});return call?call(action,options):action==='admins'?{items:[],nextCursor:null}:{admin:{uid:'target',email:options.data.email || 'target@example.com',permissions:options.data.permissions || [],active:action!=='admin-revoke'}};}};
  let panel;const redraw=()=>{root.replaceChildren();panel?.render(root);};
  panel=createAdminRosterPanel({document:doc,window:win,locale:()=> 'en',isOwner:()=>owner,getUser:()=>user,api,redraw});
  return {doc,win,root,find,storage,writes,panel,redraw,setOwner:value=>{owner=value;},setUser:value=>{user=value;},setConfirm:value=>{allow=value;},get confirmed(){return confirmed;}};
}

test('roster grants require owner access, an existing-account email, selected scopes and a final confirmation',async()=>{
  assert.throws(()=>validateAdminGrant('bad',[]));assert.throws(()=>validateAdminGrant('person@example.com',['reports_manage']));assert.deepEqual(validateAdminGrant(' PERSON@EXAMPLE.COM ',['mail']),{email:'person@example.com',permissions:['mail']});
  const f=rosterFixture();f.redraw();f.panel.ensureLoaded();await flush();assert.equal(f.doc.getElementById('adminPermission-dashboard').checked,true);assert.equal(f.doc.getElementById('adminPermission-mail').checked,true);assert.equal(f.doc.getElementById('adminPermission-reports_manage').checked,false);assert.equal(f.doc.getElementById('adminPermission-apps_manage').checked,false);
  const email=f.doc.getElementById('adminGrantEmail');email.value='target@example.com';await email.fire('input');f.setConfirm(false);await f.doc.getElementById('adminGrantForm').fire('submit');assert.equal(f.writes.length,0);assert.match(f.confirmed,/target@example.com/);assert.match(f.confirmed,/View dashboard/);assert.match(f.confirmed,/only their own email/);assert.doesNotMatch(f.confirmed,/Update and reply/);
  f.setConfirm(true);await f.doc.getElementById('adminGrantForm').fire('submit');assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].data.permissions,['dashboard','mail']);assert.ok(f.root.textContent.includes('Administrator permissions saved'));f.panel.destroy();
  const denied=rosterFixture({owner:false,call:()=>{throw Error('must not call');}});denied.redraw();denied.panel.ensureLoaded();await flush();assert.equal(denied.doc.getElementById('adminGrantForm'),undefined);assert.equal(denied.writes.length,0);denied.panel.destroy();
});

test('roster scope dependencies, unknown account feedback and stale owner responses remain safe',async()=>{
  let release;const f=rosterFixture({call:async(action)=>action==='admins'?{items:[]} : new Promise(resolve=>{release=resolve;})});f.redraw();f.panel.ensureLoaded();await flush();const dashboard=f.doc.getElementById('adminPermission-dashboard');dashboard.checked=false;await dashboard.fire('change');assert.equal(f.doc.getElementById('adminPermission-reports_manage').disabled,true);assert.equal(f.doc.getElementById('adminPermission-apps_manage').disabled,true);
  const email=f.doc.getElementById('adminGrantEmail');email.value='mailonly@example.com';await email.fire('input');const pending=f.doc.getElementById('adminGrantForm').fire('submit');await flush();assert.deepEqual(f.writes[0].data.permissions,['mail']);f.setOwner(false);f.panel.reset();f.redraw();release({admin:{uid:'private',email:'PRIVATE@example.com',active:true,permissions:['mail']}});await pending;assert.ok(!f.root.textContent.includes('PRIVATE'));f.panel.destroy();
  const unknown=rosterFixture({call:async action=>{if(action==='admins')return {items:[]};throw Object.assign(Error('unknown'),{code:'ACCOUNT_MUST_SIGN_IN_FIRST',status:404});}});unknown.redraw();const input=unknown.doc.getElementById('adminGrantEmail');input.value='unknown@example.com';await input.fire('input');await unknown.doc.getElementById('adminGrantForm').fire('submit');assert.match(unknown.root.textContent,/sign in with Google on the website first/);assert.equal(unknown.doc.getElementById('adminGrantEmail').disabled,false);unknown.panel.destroy();
});

test('uncertain administrator writes stay immutable and survive reload without automatic grants',async()=>{
  const f=rosterFixture({call:async action=>{if(action==='admins')return {items:[]};throw Object.assign(Error('unknown'),{deliveryUnknown:true});}});f.redraw();const input=f.doc.getElementById('adminGrantEmail');input.value='pending@example.com';await input.fire('input');await f.doc.getElementById('adminGrantForm').fire('submit');assert.equal(f.writes.length,1);assert.equal(f.doc.getElementById('adminGrantEmail').disabled,true);const original=f.writes[0].data;f.panel.reset();f.panel.ensureLoaded();await flush();f.redraw();assert.equal(f.writes.length,1);assert.equal(f.doc.getElementById('adminGrantEmail').value,'pending@example.com');await f.find(node=>node.tagName==='button'&&node.textContent.trim()==='Check original request').fire('click');assert.deepEqual(f.writes[1].data,original);f.panel.destroy();
});
