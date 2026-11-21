import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPrivateDriveController, isPrivateDriveOwner } from '../assets/site-private-drive.js';
const OWNER={email:'taithai5002@gmail.com',emailVerified:true,displayName:'Owner'};
const SAMPLE={shareUrl:'https://example.invalid/drive',smbUrl:'smb://example.invalid',smbShareUrl:'smb://example.invalid/files',webdavUrl:'https://example.invalid/files'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({getConfig=async()=>SAMPLE,loadFails=false,logoutFails=false,firstLoadPending=false}={}) {
  const elements=new Map(),sections=['smbUrl','smbShareUrl','webdavUrl'].map(key=>({hidden:false,dataset:{configSection:key}})),buttons=['smbUrl','smbShareUrl','webdavUrl'].map(key=>element({copyField:key}));
  function element(dataset={}) {return{value:'',textContent:'',hidden:false,disabled:false,dataset,listeners:{},classList:{add(){},remove(){}},setAttribute(key,value){this[key]=value;},removeAttribute(key){delete this[key];},addEventListener(name,callback){this.listeners[name]=callback;},focus(){this.focused=true;},select(){this.selected=true;},setSelectionRange(){this.selectionSet=true;}};}
  const doc={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(selector){return selector==='[data-config-section]'?sections:selector==='[data-copy-field]'?buttons:[];},querySelector(selector){return sections.find(section=>selector.includes(section.dataset.configSection));}};
  let callback,reads=0,logins=0,loads=0,resolveFirst,oldSubscriptions=0;const events={},timers=[];
  const win={setTimeout(callback){timers.push(callback);return timers.length;},clearTimeout(){},addEventListener(name,handler){events[name]=handler;}};
  const authApi={subscribeAuth(next){callback=next;return()=>{};},async loginWithGoogle(){logins++;},async logout(){if(logoutFails)throw new Error('network');callback(null);}};
  const nav={onLine:true,clipboard:{async writeText(){throw new Error('denied');}}};
  const services={authApi,dataApi:{async getPrivateDriveConfig(){reads++;return getConfig();}}};
  const loadServices=async()=>{loads++;if(loadFails)throw new Error('network');if(firstLoadPending&&loads===1)return new Promise(resolve=>{resolveFirst=resolve;});return services;};
  const controller=createPrivateDriveController({document:doc,window:win,navigator:nav,loadServices});
  return{controller,elements,buttons,events,auth:next=>callback(next),reads:()=>reads,logins:()=>logins,timers,loads:()=>loads,oldSubscriptions:()=>oldSubscriptions,resolveFirst:()=>resolveFirst({authApi:{subscribeAuth(){oldSubscriptions++;return()=>{};}},dataApi:services.dataApi})};
}
assert.equal(isPrivateDriveOwner(OWNER),true);
assert.equal(isPrivateDriveOwner({...OWNER,emailVerified:false}),false);
assert.equal(isPrivateDriveOwner({...OWNER,email:'other@example.invalid'}),false);
const guest=fixture();await guest.controller.boot();guest.auth(null);await tick();assert.equal(guest.reads(),0);assert.equal(guest.elements.get('privateDriveAccess').hidden,true);assert.equal(guest.elements.get('privateDriveSignIn').hidden,false);
guest.auth({...OWNER,email:'other@example.invalid'});await tick();assert.equal(guest.reads(),0);assert.match(guest.elements.get('statusText').textContent,/ไม่มีสิทธิ์/);
guest.auth({...OWNER,emailVerified:false});await tick();assert.equal(guest.reads(),0);
guest.auth(OWNER);await tick();assert.equal(guest.reads(),1);assert.equal(guest.elements.get('openDrive').href,SAMPLE.shareUrl);assert.equal(guest.elements.get('privateDriveAccess').hidden,false);
await guest.buttons[0].listeners.click();assert.equal(guest.elements.get('smbUrl').selected,true);assert.equal(guest.elements.get('smbUrl').selectionSet,true);assert.match(guest.elements.get('toast').textContent,/เลือกข้อความ/);
guest.auth(null);await tick();assert.equal(guest.elements.get('privateDriveAccess').hidden,true);assert.equal(guest.elements.get('smbUrl').value,'');assert.equal(guest.elements.get('openDrive').href,undefined);
const partial=fixture({getConfig:async()=>({...SAMPLE,smbUrl:'',smbShareUrl:'',webdavUrl:''})});await partial.controller.boot();partial.auth(OWNER);await tick();assert.equal(partial.elements.get('privateDriveAccess').hidden,false);assert.equal(partial.elements.get('privateDriveNoConnections').hidden,false);
let finish;const stale=fixture({getConfig:()=>new Promise(resolve=>{finish=resolve;})});await stale.controller.boot();stale.auth(OWNER);await tick();stale.auth(null);finish(SAMPLE);await tick();assert.equal(stale.elements.get('privateDriveAccess').hidden,true);assert.equal(stale.elements.get('openDrive').href,undefined);
const invalid=fixture({getConfig:async()=>({...SAMPLE,shareUrl:'javascript:alert(1)'})});await invalid.controller.boot();invalid.auth(OWNER);await tick();assert.equal(invalid.elements.get('privateDriveAccess').hidden,true);assert.equal(invalid.elements.get('privateDriveRetry').hidden,false);assert.equal(invalid.elements.get('openDrive').href,undefined);
const missing=fixture({getConfig:async()=>{const e=new Error('missing');e.code='site/not-found';throw e;}});await missing.controller.boot();missing.auth(OWNER);await tick();assert.match(missing.elements.get('statusText').textContent,/ยังไม่มีข้อมูล/);assert.equal(missing.elements.get('privateDriveRetry').hidden,false);
const offline=fixture({loadFails:true});await offline.controller.boot();assert.equal(offline.elements.get('privateDriveRetry').hidden,false);assert.match(offline.elements.get('statusText').textContent,/ลองอีกครั้ง/);
const logout=fixture({logoutFails:true});await logout.controller.boot();logout.auth(OWNER);await tick();await logout.elements.get('privateDriveSignOut').listeners.click();assert.equal(logout.elements.get('privateDriveAccess').hidden,true);assert.equal(logout.elements.get('openDrive').href,undefined);
const bfcache=fixture();await bfcache.controller.boot();bfcache.auth(OWNER);await tick();
bfcache.events.pagehide();assert.equal(bfcache.elements.get('openDrive').href,undefined);
bfcache.events.pageshow({persisted:true});await tick();bfcache.auth(OWNER);await tick();assert.equal(bfcache.loads(),2);assert.equal(bfcache.elements.get('privateDriveAccess').hidden,false);
const delayed=fixture({firstLoadPending:true});const firstBoot=delayed.controller.boot();delayed.timers[0]();await firstBoot;
assert.equal(delayed.elements.get('privateDriveRetry').hidden,false);
delayed.elements.get('privateDriveRetry').listeners.click();await tick();delayed.auth(OWNER);await tick();
assert.equal(delayed.loads(),2);assert.equal(delayed.elements.get('privateDriveAccess').hidden,false);
delayed.resolveFirst();await tick();assert.equal(delayed.oldSubscriptions(),0,'An older timed-out load cannot subscribe after retry');
console.log('Private Drive: bfcache reauthentication and hung-import timeout/retry lease passed');
const html=fs.readFileSync(new URL('../Private Drive/index.html',import.meta.url),'utf8');
assert.doesNotMatch(html,/(?:https?|smb):\/\/|\.ts\.net|pubshares\/|const shareUrl|data-copy=/);
assert.match(html,/id="privateDriveAccess" data-private hidden/);assert.match(html,/id="privateDriveConnections" data-private hidden/);
assert.doesNotMatch(fs.readFileSync(new URL('../assets/site-private-drive.js',import.meta.url),'utf8'),/\bfetch\s*\(|localStorage\s*\./); // Comments may mention the storage rule below.
console.log('Private Drive: owner gate, no guest reads, auth transitions, stale response rejection, partial/missing/invalid config, clipboard fallback and logout cleanup passed');
console.log('Private Drive public HTML contains no connection endpoints; no endpoint health request is implemented');
