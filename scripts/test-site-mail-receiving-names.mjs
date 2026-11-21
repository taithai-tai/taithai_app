import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMailboxReceivingNameService } from '../server-lib/site-mail-receiving-names.js';

const user={uid:'owner',email_verified:true,email:'owner@example.com'},other={uid:'other',email_verified:true};
const record={uid:user.uid,id:'mbx_owner',address:'official@taithai.app',provider:'hostinger',status:'active'};
const otherRecord={uid:other.uid,id:'mbx_other',address:'other@taithai.app',provider:'hostinger',status:'active'};
const clone=value=>value==null?value:structuredClone(value);
const code=expected=>error=>error.code===expected;
const path='siteMailReceivingNames/'+createHash('sha256').update(user.uid+'\n'+record.id).digest('hex');
function fixture(){
 const docs=new Map(),access=new Set([user.uid,other.uid]),control={enabled:true,reads:0,writeCount:0,inventoryCount:0,time:Date.parse('2026-11-22T00:00:00Z')};
 const stocks=new Map([[record.id,{mailbox:{id:'AC_owner',address:record.address},catchallEnabled:true,aliases:[{id:'AA_social',address:'social@taithai.app',active:true,createdAt:'2026-11-21T00:00:00Z',mailbox:{id:'AC_owner',address:record.address}}],unavailableAddresses:['other@taithai.app','foreign@taithai.app']}],[otherRecord.id,{mailbox:{id:'AC_other',address:otherRecord.address},catchallEnabled:false,aliases:[],unavailableAddresses:[record.address,'social@taithai.app']}]]);
 let queue=Promise.resolve();
 const store={get:async key=>clone(docs.get(key)||null),transaction(fn){const current=queue.then(async()=>{const writes=[];const value=await fn({get:async key=>clone(docs.get(key)||null),set(key,input){assert.equal(JSON.stringify(input).includes('undefined'),false);writes.push([key,clone(input)]);}});for(const [key,input]of writes){docs.set(key,input);control.writeCount++;}return value;});queue=current.catch(()=>{});return current;}};
 const provider={async receivingInventory(selected){control.inventoryCount++;const stock=clone(stocks.get(selected.id));if(selected.id===record.id)stock.catchallEnabled=control.enabled;return stock;}};
 async function owned(current,input){control.reads++;if(!current?.email_verified||!access.has(current.uid))throw Object.assign(Error('access'),{code:'MAIL_ACCESS_REQUIRED',status:403});const selected=[record,otherRecord].find(box=>box.uid===current.uid&&box.id===input.mailbox);if(!selected)throw Object.assign(Error('notfound'),{code:'MAILBOX_NOT_FOUND',status:404});return {record:clone(selected),credentials:{password:'private-password'}};}
 const candidates=raw=>raw?.candidates;
 const service=createMailboxReceivingNameService({store,provider,owned,candidates,now:()=>control.time,allowReserved:current=>current.uid===user.uid});
 return {service,docs,access,control,stocks,store,provider,owned,candidates};
}
const input=localPart=>({mailbox:record.id,localPart});
const raw=(address,sources=['to'],date='2026-11-21T12:00:00Z')=>({internalDate:date,candidates:[{address,sources}]});

test('list combines active provider names without exposing foreign addresses or provider ids',async()=>{
 const f=fixture(),dto=await f.service.list(user,{mailbox:record.id,uid:other.uid});
 assert.deepEqual(dto.receivingNames,[{address:'social@taithai.app',kind:'provider-alias',firstSeenAt:null,lastSeenAt:null,sources:[]}]);
 assert.equal(dto.receivingNameCount,1);assert.equal(dto.receivingNameLimit,500);assert.equal(dto.receivingNamesTruncated,false);assert.deepEqual(dto.catchall,{enabled:true,mailboxAddress:record.address});assert.equal(dto.receivingNamesUpdatedAt,null);
 const json=JSON.stringify(dto);for(const value of ['AC_owner','AA_social','other@taithai.app','foreign@taithai.app','private-password'])assert.equal(json.includes(value),false);
});

test('manual save is a deterministic local upsert and never reserves global namespace',async()=>{
 const f=fixture(),first=await f.service.save(user,input('  Streaming  '));
 assert.equal(first.receivingNameCount,2);assert.deepEqual(first.receivingNames[1],{address:'streaming@taithai.app',kind:'saved',firstSeenAt:null,lastSeenAt:null,sources:[]});
 const writes=f.control.writeCount;f.control.time+=60000;const retry=await f.service.save(user,input('streaming'));
 assert.equal(f.control.writeCount,writes);assert.equal(retry.receivingNamesUpdatedAt,first.receivingNamesUpdatedAt);
 assert.deepEqual([...f.docs.keys()],[path]);assert.equal(JSON.stringify([...f.docs.values()]).includes('private-password'),false);
});

test('existing provider alias save remains idempotent and consumes no storage slot',async()=>{
 const f=fixture();assert.equal((await f.service.save(user,input('social'))).receivingNameCount,1);assert.equal(f.docs.size,0);assert.equal(f.control.writeCount,0);
});

test('catch-all must be verified live for save and automatic observation',async()=>{
 const f=fixture();f.control.enabled=false;await assert.rejects(f.service.save(user,input('newname')),code('MAIL_CATCHALL_REQUIRED'));
 const dto=await f.service.observe(user,record,[raw('newname@taithai.app')]);assert.equal(dto.changed,false);assert.equal(dto.catchall.enabled,false);assert.equal(dto.canSaveReceivingName,false);assert.equal(f.docs.size,0);
 f.control.enabled=true;assert.equal((await f.service.save(user,input('newname'))).receivingNameCount,2);
});

test('fresh ownership rejects forged UID or selected mailbox for every operation',async()=>{
 const f=fixture();
 for(const action of ['list','save','hide'])await assert.rejects(f.service[action](user,{mailbox:otherRecord.id,uid:other.uid,localPart:'newname',confirmAddress:'newname@taithai.app'}),code('MAILBOX_NOT_FOUND'));
 await assert.rejects(f.service.observe(user,otherRecord,[raw('newname@taithai.app')]),code('MAILBOX_NOT_FOUND'));
 await assert.rejects(f.service.recipientAddresses(user,otherRecord),code('MAILBOX_NOT_FOUND'));
 f.access.delete(user.uid);await assert.rejects(f.service.save(user,input('newname')),code('MAIL_ACCESS_REQUIRED'));assert.equal(f.docs.size,0);
});

test('auto-discovery deduplicates domain names, records metadata provenance, and excludes foreign destinations',async()=>{
 const f=fixture();f.docs.set('siteMailNames/reservedperson',{uid:other.uid,mailboxId:otherRecord.id,address:'reservedperson@taithai.app',provider:'hostinger',status:'provisioning'});
 const dto=await f.service.observe(user,record,[raw('Streaming@Taithai.App',['to']),raw('streaming@taithai.app',['delivered-to'],'2026-11-21T13:00:00Z'),raw('other@taithai.app'),raw('foreign@taithai.app'),raw('reservedperson@taithai.app'),raw(record.address),raw('social@taithai.app'),raw('evil@example.com')]);
 assert.equal(dto.changed,true);assert.equal(dto.receivingNameCount,2);assert.deepEqual(dto.receivingNames[1],{address:'streaming@taithai.app',kind:'observed',firstSeenAt:'2026-11-21T12:00:00Z',lastSeenAt:'2026-11-21T13:00:00Z',sources:['to','delivered-to']});
 assert.equal([...f.docs.keys()].filter(key=>key.startsWith('siteMailNames/')).length,1);
});

test('repeated same inbox page does not change timestamps, count or stored state',async()=>{
 const f=fixture(),messages=[raw('unique@taithai.app')];const first=await f.service.observe(user,record,messages),writes=f.control.writeCount;
 f.control.time+=60000;const again=await f.service.observe(user,record,messages);assert.equal(again.changed,false);assert.equal(f.control.writeCount,writes);assert.equal(again.receivingNameCount,first.receivingNameCount);assert.equal(again.receivingNamesUpdatedAt,first.receivingNamesUpdatedAt);
});

test('saved name gains first and latest observed dates without losing its saved identity',async()=>{
 const f=fixture();await f.service.save(user,input('streaming'));await f.service.observe(user,record,[raw('streaming@taithai.app',['to'],'2026-11-21T13:00:00Z')]);
 const dto=await f.service.observe(user,record,[raw('streaming@taithai.app',['cc'],'2026-11-21T12:00:00Z')]);
 const value=dto.receivingNames.find(name=>name.address==='streaming@taithai.app');assert.equal(value.kind,'saved');assert.equal(value.firstSeenAt,'2026-11-21T12:00:00Z');assert.equal(value.lastSeenAt,'2026-11-21T13:00:00Z');assert.deepEqual(value.sources,['to','cc']);
});

test('hide is idempotent, does not stop routing or resurrect on later mail, and keeps historical annotation',async()=>{
 const f=fixture();await f.service.observe(user,record,[raw('streaming@taithai.app')]);
 await assert.rejects(f.service.hide(user,{mailbox:record.id,confirmAddress:record.address}),code('ALIAS_CONFIRMATION_REQUIRED'));
 const hidden=await f.service.hide(user,{mailbox:record.id,confirmAddress:'streaming@taithai.app'});assert.equal(hidden.receivingNameCount,1);assert.equal(hidden.catchall.enabled,true);const writes=f.control.writeCount;
 await f.service.hide(user,{mailbox:record.id,confirmAddress:'streaming@taithai.app'});assert.equal(f.control.writeCount,writes);
 const observed=await f.service.observe(user,record,[raw('streaming@taithai.app',['to'],'2026-11-22T00:00:00Z')]);assert.equal(observed.changed,false);assert.equal(observed.receivingNameCount,1);
 assert.deepEqual(await f.service.recipientAddresses(user,record),[{address:record.address,kind:'primary'},{address:'streaming@taithai.app',kind:'previous'}]);
 const restored=await f.service.save(user,input('streaming'));assert.equal(restored.receivingNameCount,2);assert.equal(restored.receivingNames[1].kind,'saved');
});

test('provider aliases cannot be hidden through local receiving-name operation',async()=>{
 const f=fixture();await assert.rejects(f.service.hide(user,{mailbox:record.id,confirmAddress:'social@taithai.app'}),code('MAIL_RECEIVING_NAME_IS_PROVIDER_ALIAS'));assert.equal(f.docs.size,0);
});

test('inactive alias and foreign namespace claims prevent manually misleading catch-all names',async()=>{
 const f=fixture();f.stocks.get(record.id).aliases.push({id:'AA_inactive',address:'inactive@taithai.app',active:false,mailbox:{id:'AC_owner',address:record.address}});
 await assert.rejects(f.service.save(user,input('inactive')),code('ADDRESS_UNAVAILABLE'));await assert.rejects(f.service.save(user,input('foreign')),code('ADDRESS_UNAVAILABLE'));
 f.docs.set('siteMailNames/taken',{uid:other.uid,mailboxId:otherRecord.id,address:'taken@taithai.app',provider:'hostinger',status:'deleted'});await assert.rejects(f.service.save(user,input('taken')),code('ADDRESS_UNAVAILABLE'));
 assert.equal((await f.service.observe(user,record,[raw('inactive@taithai.app')])).changed,false);
});

test('reserved manual names require trusted authorization and cannot be overridden by client input',async()=>{
 const f=fixture();assert.equal((await f.service.save(user,input('support'))).receivingNameCount,2);
 const service=createMailboxReceivingNameService({...f,now:()=>f.control.time,allowReserved:()=>false});
 await assert.rejects(service.save(user,{...input('admin'),owner:true,allowReserved:true}),code('RESERVED_LOCAL_PART'));
});

test('simultaneous observation merges names transactionally and does not duplicate names',async()=>{
 const f=fixture();await Promise.all([f.service.observe(user,record,[raw('first@taithai.app'),raw('shared@taithai.app')]),f.service.observe(user,record,[raw('second@taithai.app'),raw('shared@taithai.app')])]);
 const dto=await f.service.list(user,{mailbox:record.id});assert.equal(dto.receivingNameCount,4);assert.equal(new Set(dto.receivingNames.map(name=>name.address)).size,4);
});

test('bounded discovery marks truncation without growing state beyond the cap or failing inbox',async()=>{
 const f=fixture();for(let offset=0;offset<512;offset+=128){const raws=Array.from({length:Math.min(128,512-offset)},(_,index)=>({address:`person${index+offset}@taithai.app`,sources:['to']}));await f.service.observe(user,record,[{internalDate:'2026-11-21T12:00:00Z',candidates:raws}]);}
 const dto=await f.service.list(user,{mailbox:record.id});assert.equal(f.docs.get(path).entries.length,499);assert.equal(dto.receivingNameCount,500);assert.equal(dto.receivingNamesTruncated,true);assert.equal(dto.canSaveReceivingName,false);
 await assert.rejects(f.service.save(user,input('newperson')),code('MAIL_RECEIVING_NAME_LIMIT_REACHED'));
});

test('candidate limits and malformed metadata cannot inject foreign domains, unsafe names or headers',async()=>{
 const f=fixture();const dto=await f.service.observe(user,record,[raw('bad\nname@taithai.app'),raw('bad..name@taithai.app'),raw('person@taithai.app',['bcc']),raw('person@taithai.app',[]),raw('person@taithai.app',['to','<script>'])]);
 assert.equal(dto.receivingNameCount,2);assert.deepEqual(dto.receivingNames[1].sources,['to']);
});

test('provider or datastore ownership inconsistencies fail closed without returning another user data',async()=>{
 const f=fixture();f.stocks.get(record.id).mailbox.address=otherRecord.address;await assert.rejects(f.service.list(user,{mailbox:record.id}),code('MAIL_RECEIVING_NAMES_UNAVAILABLE'));
 const g=fixture();g.docs.set(path,{uid:other.uid,mailboxId:record.id,mailboxAddress:record.address,entries:[],truncated:false,updatedAt:null});await assert.rejects(g.service.list(user,{mailbox:record.id}),code('MAIL_RECEIVING_NAMES_UNAVAILABLE'));
});

test('recipient annotation does not depend on management API and preserves per-account isolation',async()=>{
 const f=fixture();await f.service.save(user,input('streaming'));f.provider.receivingInventory=async()=>{throw Error('provider down');};
 assert.deepEqual(await f.service.recipientAddresses(user,record),[{address:record.address,kind:'primary'},{address:'streaming@taithai.app',kind:'alias'}]);
 assert.deepEqual(await f.service.recipientAddresses(other,otherRecord),[{address:otherRecord.address,kind:'primary'}]);
});

test('permission revocation during provider inventory prevents local mutation',async()=>{
 const f=fixture(),read=f.provider.receivingInventory;
 f.provider.receivingInventory=async selected=>{const stock=await read(selected);f.access.delete(user.uid);return stock;};
 await assert.rejects(f.service.save(user,input('streaming')),code('MAIL_ACCESS_REQUIRED'));assert.equal(f.docs.size,0);
});

test('invalid date values fall back safely while malformed provider IDs are refused',async()=>{
 const f=fixture();const dto=await f.service.observe(user,record,[{internalDate:new Date('invalid'),candidates:[{address:'streaming@taithai.app',sources:['to']}]}]);
 assert.equal(dto.receivingNames[1].firstSeenAt,'2026-11-22T00:00:00.000Z');
 f.stocks.get(record.id).mailbox.id=123;await assert.rejects(f.service.list(user,{mailbox:record.id}),code('MAIL_RECEIVING_NAMES_UNAVAILABLE'));
});

test('combined provider and local limit never saves a name that the response cannot confirm',async()=>{
 const f=fixture();for(let offset=0;offset<499;offset+=128)await f.service.observe(user,record,[{internalDate:'2026-11-21T12:00:00Z',candidates:Array.from({length:Math.min(128,499-offset)},(_,index)=>({address:`person${index+offset}@taithai.app`,sources:['to']}))}]);
 await f.service.hide(user,{mailbox:record.id,confirmAddress:'person0@taithai.app'});
 const saved=await f.service.save(user,input('manualboundary'));assert.equal(saved.receivingNameCount,500);assert.ok(saved.receivingNames.some(name=>name.address==='manualboundary@taithai.app'&&name.kind==='saved'));
 const writes=f.control.writeCount;await assert.rejects(f.service.save(user,input('person0')),code('MAIL_RECEIVING_NAME_LIMIT_REACHED'));assert.equal(f.control.writeCount,writes);
});
