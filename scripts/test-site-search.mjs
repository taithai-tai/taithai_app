import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APP_CATALOG,normalizeAppSettings} from '../assets/site-app-catalog.js';
import {normalizeSearchTerm,filterSearchApps,publicSearchProfiles,searchPublicAccounts,initSiteSearch} from '../assets/site-search.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const profile=(uid='person1',handle='person_one',displayName='Person One')=>({uid,handle,displayName});
const json=body=>({ok:true,json:async()=>body});
function policy(overrides={}){return normalizeAppSettings({schemaVersion:1,revision:1,apps:Object.fromEntries(APP_CATALOG.map(app=>[app.id,{visibility:overrides[app.id]||app.defaultVisibility}]))});}
class Events {
  listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn({target:this,preventDefault(){this.prevented=true;},...event});}
}
class Element extends Events {
  constructor(tag,doc){super();this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.dataset={};this.style={};this.hidden=false;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('');}
  set innerHTML(_){throw Error('Untrusted HTML must not be inserted');}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  insertBefore(node,before){node.parent=this;const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}removeAttribute(key){delete this.attributes[key];}
  contains(node){return this===node||this.children.some(child=>child.contains?.(node));}
  focus(){this.ownerDocument.activeElement=this;this.fire('focus');}select(){this.selected=true;}scrollIntoView(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  all(){return [this,...this.children.flatMap(child=>child.all?.()||[])];}
  querySelector(selector){const selectors=selector.split(',');return this.all().slice(1).find(node=>selectors.some(part=>part.startsWith('.')?node.className?.split(' ').includes(part.slice(1)):part==='[data-site-search]'?node.dataset.siteSearch=== 'true':false))||null;}
}
async function setup(options={}){
  const doc=new Events();doc.documentElement={lang:'en'};doc.createElement=tag=>new Element(tag,doc);doc.createElementNS=(_,tag)=>new Element(tag,doc);
  const host=doc.createElement('div'),tools=doc.createElement('div');tools.className='header-tools';host.append(tools);doc.querySelector=()=>host;
  const win=new Events();let locale='en';win.document=doc;win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;win.location={assign(url){win.destination=url;}};win.TaithaiPreferences={get:()=>({language:locale})};
  const calls=[];let authCallback,user=options.user||null;
  const auth={subscribeAuth(fn){authCallback=fn;fn(user);return()=>{auth.unsubscribed=true;};}};
  const app=initSiteSearch({window:win,document:doc,host,debounceMs:0,loadData:async()=>({getAppVisibilitySettings:async()=>policy()}),loadAuth:async()=>auth,request:async(url,init)=>{calls.push({url,init});return json({items:[profile()]});},...options});
  await tick();return {app,doc,win,host,calls,auth,async type(value){app.input.value=value;app.input.fire('input');await tick();},async notify(value){user=value;authCallback(value);await tick();},locale(value){locale=value;win.fire('taithai:preferences');},options(){return app.form.all().filter(node=>node.attributes.role==='option');},find(className){return app.form.all().find(node=>node.className===className);}};
}

test('app search always obeys the public server policy, including for a site owner',()=>{
  assert.equal(normalizeSearchTerm('  ค้นหา  แอป  '),'ค้นหา แอป');
  const settings=policy({'qr-generator':'unlisted','qr-reader':'private','ace':'private'});
  assert.deepEqual(filterSearchApps(settings,'qr'),[]);
  assert.deepEqual(filterSearchApps(settings,'Private'),[]);
  assert.equal(filterSearchApps(settings,'memory')[0].id,'movie-memory');
  assert.deepEqual(filterSearchApps({...settings,valid:false},'memory'),[]);
  assert.deepEqual(filterSearchApps(null,'memory'),[]);
  assert.deepEqual(filterSearchApps(policy(),'@movie'),[]);
});

test('public profile search keeps an allowlisted DTO and discards malformed or duplicate identities',()=>{
  const rows=publicSearchProfiles({items:[{...profile(),email:'private@example.com',permissions:['owner']},profile(),profile('../unsafe'),profile('safe','<script>')]});
  assert.deepEqual(rows,[profile()]);assert.equal('email' in rows[0],false);assert.equal('permissions' in rows[0],false);
});

test('account query is bounded, normalized, authenticated when available and never sends cookies',async()=>{
  const calls=[];const request=async(url,init)=>{calls.push({url,init});return json({items:[profile()]});};
  assert.deepEqual(await searchPublicAccounts({query:'x',request}),[]);
  assert.deepEqual(await searchPublicAccounts({query:'a'.repeat(49),request}),[]);
  const user={emailVerified:true,getIdToken:async()=>'test-token'};
  await searchPublicAccounts({query:' @PERSON ',user,request});
  assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).searchParams.get('q'),'person');
  assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.cache,'no-store');assert.deepEqual(calls[0].init.headers,{Authorization:'Bearer test-token'});
});

test('the header loads no accounts before a query and shows apps without waiting for account search',async()=>{
  const people=deferred();const site=await setup({request:()=>people.promise,debounceMs:30});
  assert.equal(site.options().length,0);assert.equal(site.app.popup.hidden,true);
  await site.type('qr');assert.equal(site.options().length,2);assert.equal(site.app.input.attributes['aria-expanded'],'true');
  people.resolve(json({items:[profile()]}));await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(site.options().length,3);site.app.destroy();
});

test('an arriving account result does not change the app selected with the keyboard',async()=>{
  const people=deferred(),site=await setup({request:()=>people.promise});await site.type('qr');
  site.app.input.fire('keydown',{key:'ArrowDown'});site.app.input.fire('keydown',{key:'ArrowDown'});
  const selected=site.options()[1].href;people.resolve(json({items:[profile()]}));await tick();
  site.app.input.fire('keydown',{key:'Enter'});assert.equal(site.win.destination,selected);site.app.destroy();
});

test('late results from an older query never replace the latest results',async()=>{
  const old=deferred(),fresh=deferred();let count=0;
  const site=await setup({request:()=>++count===1?old.promise:fresh.promise});
  await site.type('old');await site.type('new');fresh.resolve(json({items:[profile('new-person','new_person','New Person')]}));await tick();
  old.resolve(json({items:[profile('old-person','old_person','Old Person')]}));await tick();
  assert.match(site.app.form.textContent,/New Person/);assert.doesNotMatch(site.app.form.textContent,/Old Person/);site.app.destroy();
});

test('switching accounts cancels an unresolved token before it can be sent',async()=>{
  const token=deferred(),calls=[];
  const site=await setup({user:{uid:'old',emailVerified:true,getIdToken:()=>token.promise},request:async(url,init)=>{calls.push(init.headers);return json({items:[]});}});
  await site.type('person');await site.notify({uid:'new',emailVerified:true,getIdToken:async()=>'new-token'});
  token.resolve('old-token');await tick();assert.deepEqual(calls,[{Authorization:'Bearer new-token'}]);site.app.destroy();
});

test('policy failure keeps hidden app links closed while public account search and retry remain usable',async()=>{
  let failure=true;
  const site=await setup({loadData:async()=>({getAppVisibilitySettings:async()=>{if(failure)throw Error('OFFLINE');return policy();}})});
  await site.type('qr');assert.equal(site.options().length,1);assert.match(site.app.form.textContent,/app list could not load/);
  assert.equal(site.find('site-search-retry').hidden,false);failure=false;site.find('site-search-retry').fire('click');await tick();await tick();
  assert.equal(site.options().length,3);site.app.destroy();
});

test('keyboard selection, escape, clearing and exact profile URLs work without moving focus into results',async()=>{
  const site=await setup();await site.type('person');const [option]=site.options();
  site.app.input.focus();await tick();site.app.input.fire('keydown',{key:'ArrowUp'});
  assert.equal(site.doc.activeElement,site.app.input);assert.equal(site.app.input.attributes['aria-activedescendant'],option.id);
  site.app.input.fire('keydown',{key:'Enter'});assert.equal(site.win.destination,'https://taithai.app/profile/?uid=person1');assert.equal(site.app.popup.hidden,true);
  await site.type('person');site.app.input.fire('keydown',{key:'Escape'});assert.equal(site.app.popup.hidden,true);assert.equal(site.app.input.value,'person');
  site.find('site-search-clear').fire('click');assert.equal(site.app.input.value,'');assert.equal(site.app.input.attributes['aria-expanded'],'false');site.app.destroy();
});

test('malicious display names are text and cannot introduce HTML or unsafe links',async()=>{
  const site=await setup({request:async()=>json({items:[profile('safe_uid','safe_name','<img src=x onerror=alert(1)>')]})});
  await site.type('safe');assert.match(site.app.form.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(site.options()[0].href,'https://taithai.app/profile/?uid=safe_uid');site.app.destroy();
});

test('IME composition waits until completion and language changes preserve the query',async()=>{
  const site=await setup();site.app.input.fire('compositionstart');await site.type('ชื่อ');assert.equal(site.calls.length,0);
  site.app.input.fire('compositionend');await tick();assert.equal(site.calls.length,1);site.locale('th');assert.equal(site.app.input.value,'ชื่อ');assert.equal(site.app.input.placeholder,'ค้นหาแอป หรือ @ชื่อผู้ใช้');site.app.destroy();
});

test('pagehide clears query and results; old responses cannot reappear after BFCache restoration',async()=>{
  const pending=deferred();let count=0;const site=await setup({request:()=>++count===1?pending.promise:Promise.resolve(json({items:[]}))});
  await site.type('person');site.win.fire('pagehide');assert.equal(site.app.input.value,'');assert.equal(site.app.popup.hidden,true);assert.equal(site.auth.unsubscribed,true);
  site.win.fire('pageshow',{persisted:true});pending.resolve(json({items:[profile()]}));await tick();assert.doesNotMatch(site.app.form.textContent,/Person One/);assert.equal(site.app.input.value,'');site.app.destroy();
});

test('account failures preserve app results and produce an accessible retry instead of an empty dead end',async()=>{
  const site=await setup({request:async()=>{throw Error('SECRET_BACKEND_DETAIL');}});await site.type('qr');assert.equal(site.options().length,2);assert.match(site.app.form.textContent,/Account search could not load/);assert.doesNotMatch(site.app.form.textContent,/SECRET_BACKEND_DETAIL/);assert.equal(site.find('site-search-retry').hidden,false);site.app.destroy();
});

test('all primary pages load one shared search and expose community navigation',async()=>{
  for(const name of ['index.html','account/index.html','settings/index.html','help/index.html','about/index.html','privacy/index.html','support/index.html','community/index.html','profile/index.html','messages/index.html']){
    const html=await readFile(new URL('../'+name,import.meta.url),'utf8');assert.equal((html.match(/src="\/assets\/site-search\.js"/g)||[]).length,1,name);assert.equal((html.match(/href="\/assets\/site-search\.css"/g)||[]).length,1,name);assert.match(html,/href="(?:https:\/\/taithai\.app)?\/community\/"/,name);assert.match(html,/href="(?:https:\/\/taithai\.app)?\/messages\/"/,name);
  }
});
