import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteMail, encryptMailboxCredential } from '../server-lib/site-mail.js';

const user={uid:'receiving_fixture_owner',email:'owner@example.org',email_verified:true};
const env={OWNER_MAIL_ENABLED:'true',MAIL_READY:'true',MAIL_DOMAIN:'taithai.app',MAIL_PROVIDER:'hostinger',HOSTINGER_API_TOKEN:'fixture-token',HOSTINGER_MAIL_ORDER_ID:'OR_fixture',MAIL_CREDENTIAL_SECRET:Buffer.alloc(32,24).toString('base64')};
function fixture(){
 const record={id:user.uid,uid:user.uid,address:'official@taithai.app',localPart:'official',provider:'hostinger',status:'active'};
 record.credential=encryptMailboxCredential('fixture-password',{env,userId:user.uid,mailboxAddress:record.address});
 const docs=new Map([[`siteMailboxes/${user.uid}`,record]]),control={providerDown:false,active:true};
 const clone=value=>value==null?value:structuredClone(value);
 const store={get:async key=>clone(docs.get(key)),set:async(key,value)=>docs.set(key,clone(value)),withLock:async(key,fn)=>fn()};store.runTransaction=async fn=>fn({get:store.get,set:store.set});
 const mailbox={id:'AC_fixture',address:record.address};
 const provider={id:'hostinger',async receivingInventory(){if(control.providerDown)throw Error('fixture provider unavailable');return {mailbox,aliases:[],catchallEnabled:true,unavailableAddresses:['foreign@taithai.app']};},async aliasInventory(){return {mailbox,aliases:[],limit:5,available:5,mailboxUsed:0,domainUsed:0};},async createAlias(){throw Error('Provider aliases must not be created');},async deleteAlias(){throw Error('Provider aliases must not be deleted');}};
 const raw={uid:12,envelope:{to:[{address:'fresh@taithai.app'}]},headers:Buffer.from('Delivered-To: fresh@taithai.app\r\n\r\n'),internalDate:new Date('2026-11-22T01:00:00Z'),flags:new Set(),text:'fixture'};
 const mail=createSiteMail({store,provider,env,now:()=>Date.parse('2026-11-22T02:00:00Z'),getMembership:async()=>({active:control.active,adminAccess:control.active,mailAccess:control.active}),smtp:{async verifyCredentials(){control.verifyChecks=(control.verifyChecks||0)+1;return {connected:true};}},imap:{async list(){return {uidValidity:'1',messages:[raw],nextCursor:null};},async message(){return raw;}}});
 return {mail,raw,docs,control};
}

test('incoming discovery persists a new name, counts it and labels the same message response',async()=>{
 const f=fixture();const response=await f.mail.list(user,{folder:'INBOX'});
 assert.equal(response.receivingNamesState.receivingNameCount,1);
 assert.deepEqual(response.receivingNamesState.receivingNames.map(x=>x.address),['fresh@taithai.app']);
 assert.deepEqual(response.messages[0].recipientMatches,[{address:'fresh@taithai.app',sources:['to','delivered-to'],kind:'alias'}]);
 const again=await f.mail.list(user,{folder:'INBOX'});assert.equal(again.receivingNamesState.changed,false);
 const aliases=await f.mail.listAliases(user,{mailbox:user.uid});assert.equal(aliases.receivingNameCount,1);assert.equal(aliases.used,0);
});

test('manual save and hide use the owned catch-all registry without spending provider alias slots',async()=>{
 const f=fixture();let response=await f.mail.saveReceivingName(user,{mailbox:user.uid,localPart:'streaming'});
 assert.equal(response.receivingNameCount,1);assert.equal(response.used,0);
 response=await f.mail.saveReceivingName(user,{mailbox:user.uid,localPart:'streaming'});assert.equal(response.receivingNameCount,1);
 f.raw.envelope.to=[{address:'streaming@taithai.app'}];f.raw.headers=Buffer.from('');await f.mail.list(user,{folder:'INBOX'});
 response=await f.mail.hideReceivingName(user,{mailbox:user.uid,confirmAddress:'streaming@taithai.app'});assert.equal(response.receivingNameCount,0);
 response=await f.mail.list(user,{folder:'INBOX'});assert.equal(response.receivingNamesState.receivingNameCount,0);assert.equal(response.messages[0].recipientMatches[0].kind,'previous');
 assert.ok([...f.docs.keys()].every(key=>!key.startsWith('siteMailNames/')&&!key.startsWith('siteMailAliasJobs/')));
});

test('outgoing Sent and Drafts do not add receiving names',async()=>{
 const f=fixture();for(const folder of ['Sent','Drafts']){const list=await f.mail.list(user,{folder});assert.equal(list.receivingNamesState,undefined);const detail=await f.mail.message(user,{id:list.messages[0].id});assert.equal(detail.receivingNamesState,undefined);}
 assert.equal((await f.mail.listAliases(user,{mailbox:user.uid})).receivingNameCount,0);
});

test('management discovery outage preserves readable inbox and existing message history',async()=>{
 const f=fixture();f.control.providerDown=true;const list=await f.mail.list(user,{folder:'INBOX'});assert.equal(list.messages.length,1);assert.equal(list.receivingNamesState,undefined);
 const detail=await f.mail.message(user,{id:list.messages[0].id});assert.equal(detail.message.text,'fixture');
 const aliases=await f.mail.listAliases(user,{mailbox:user.uid});assert.equal(aliases.receivingNamesAvailable,false);assert.deepEqual(aliases.aliases,[]);
});

test('foreign names and revoked mailbox access do not become saved receiving names',async()=>{
 const f=fixture();f.raw.envelope.to=[{address:'foreign@taithai.app'}];f.raw.headers=Buffer.from('');assert.equal((await f.mail.list(user,{folder:'INBOX'})).receivingNamesState.receivingNameCount,0);
 await assert.rejects(f.mail.saveReceivingName(user,{mailbox:user.uid,localPart:'foreign'}),error=>error.code==='ADDRESS_UNAVAILABLE');
 f.control.active=false;await assert.rejects(f.mail.saveReceivingName(user,{mailbox:user.uid,localPart:'later'}),error=>error.code==='MAIL_ACCESS_REQUIRED');
});


test('connection checks authenticate only the owned mailbox without sending or creating a send job',async()=>{
 const f=fixture(),response=await f.mail.checkConnection(user,{mailbox:user.uid});assert.equal(response.smtp.connected,true);assert.equal(f.control.verifyChecks,1);assert.ok([...f.docs.keys()].every(key=>!key.startsWith('siteMailSendJobs/')));f.control.active=false;await assert.rejects(f.mail.checkConnection(user,{mailbox:user.uid}),error=>error.code==='MAIL_ACCESS_REQUIRED');assert.equal(f.control.verifyChecks,1);
});
