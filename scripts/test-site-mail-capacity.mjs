import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailCapacityService } from '../server-lib/site-mail-capacity.js';

const moment=Date.UTC(2026,10,21),config={liveMode:true,mailProvider:'hostinger'};
function fixture({capacity=2,policy={}}={}) {
  const docs=new Map();let serial=Promise.resolve(),used=0;const checks=[];
  const store={
    get:async key=>docs.get(key)||null,
    set:async(key,value,{merge=false}={})=>docs.set(key,merge?{...docs.get(key),...value}:structuredClone(value)),
    list:async(name,{where=[],limit=100}={})=>[...docs].filter(([key,value])=>key.startsWith(name+'/')&&where.every(([field,op,wanted])=>op==='=='&&value[field]===wanted)).slice(0,limit).map(([key,value])=>({...value,id:key.split('/')[1]})),
    transaction:async fn=>fn(store),
    withLock(key,fn){const task=serial.then(fn);serial=task.catch(()=>{});return task;},
  };
  const provider={inventory:async()=>({provider:'hostinger',capacity,purchasedSeats:capacity,used,available:capacity-used}),assertCapacity:async count=>{checks.push(count);if(count>capacity-used)throw Object.assign(Error('MAIL_PROVIDER_CAPACITY_REACHED'),{code:'MAIL_PROVIDER_CAPACITY_REACHED'});return true;}};
  const chosenConfig={...config,...policy};
  const service=createMailCapacityService({store,provider,config:chosenConfig,now:()=>moment});
  const reserve=(uid,quantity,requestId=`request_${uid}_123456789`,kind='checkout')=>service.reserve({uid,quantity,requestId,kind});
  function paid(uid,quantity){docs.set(`siteMemberships/${uid}`,{active:true,paid:true,livemode:true,planId:'mailbox-99',amount:9900,currency:'thb',mailboxes:quantity,quantity,currentPeriodEnd:new Date(moment+86400000).toISOString()});}
  function boxes(uid,count){const ids=Array.from({length:count},(_,i)=>i?`mbx_${uid}_${i}`:uid);docs.set(`siteMailUserAccounts/${uid}`,{uid,mailboxIds:ids});for(const id of ids)docs.set(id===uid?`siteMailboxes/${uid}`:`siteMailAccounts/${id}`,{uid,provider:'hostinger',status:'active'});used+=count;}
  return {docs,store,provider,service,reserve,checks,paid,boxes,setUsed:value=>{used=value;}};
}

test('purchased seats are reserved across simultaneous unpaid customers before hosted payment',async()=>{
  const f=fixture();const results=await Promise.allSettled([f.reserve('alice',1),f.reserve('bob',1),f.reserve('charlie',1)]);
  assert.deepEqual(results.map(item=>item.status),['fulfilled','fulfilled','rejected']);
  assert.equal(results[2].reason.code,'MAIL_PROVIDER_CAPACITY_REACHED');
  assert.deepEqual(f.checks,[1,2,3]);assert.equal(f.docs.has('siteMailCapacityHolds/charlie'),false);
});
test('retries and refreshed same-target upgrades reuse held seats; conflicting targets fail closed',async()=>{
  const f=fixture({capacity:5});f.paid('alice',1);f.boxes('alice',1);
  const id=await f.reserve('alice',2,'request_upgrade_123456789','quantity-update');
  assert.equal(await f.reserve('alice',2,'request_refresh_123456789','quantity-update'),id);
  assert.deepEqual(f.checks,[1,1]);
  await assert.rejects(f.reserve('alice',3,'request_conflict_123456789','quantity-update'),error=>error.code==='MAIL_CAPACITY_PENDING');
  assert.equal((await f.service.status()).reserved,1);
});
test('only a bound matching expired Checkout can release an unpaid hold',async()=>{
  const f=fixture({capacity:1});const reservationId=await f.reserve('alice',1);
  await f.service.bindCheckout({uid:'alice',reservationId,sessionId:'cs_fixture_alice'});
  await f.service.releaseCheckout({uid:'alice',sessionId:'cs_other'});
  await assert.rejects(f.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
  await f.service.releaseCheckout({uid:'alice',sessionId:'cs_fixture_alice'});
  assert.ok(await f.reserve('bob',1));
});
test('expired Checkout release cannot remove seats already backed by current paid invoices',async()=>{
  const f=fixture({capacity:2});const reservationId=await f.reserve('alice',2);
  await f.service.bindCheckout({uid:'alice',reservationId,sessionId:'cs_fixture_paid'});f.paid('alice',2);
  await f.service.releaseCheckout({uid:'alice',sessionId:'cs_fixture_paid'});
  assert.equal((await f.service.status()).reserved,2);
  await assert.rejects(f.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
});
test('paid uncreated mailboxes remain reserved after settlement; physical boxes are not counted twice',async()=>{
  const f=fixture({capacity:3});await f.reserve('alice',2);f.paid('alice',2);
  await f.service.settle({uid:'alice'});
  assert.equal(f.docs.get('siteMailCapacityHolds/alice').pendingQuantity,0);
  assert.equal((await f.service.status()).reserved,2);
  f.boxes('alice',2);
  assert.equal((await f.service.status()).reserved,0);
  assert.ok(await f.reserve('bob',1));
  assert.equal(f.docs.get('siteMailCapacityHolds/alice').active,false);
  await assert.rejects(f.reserve('charlie',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
});
test('old canceled mailboxes still consume provider seats and are not recycled for another buyer',async()=>{
  const f=fixture({capacity:1});f.boxes('alice',1);
  await assert.rejects(f.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
  assert.equal(f.docs.get('siteMailboxes/alice').status,'active');
});
test('unpaid Portal holds do not expire on guessed times and cannot be released through Checkout cleanup',async()=>{
  const f=fixture({capacity:2});f.paid('alice',1);f.boxes('alice',1);
  await f.reserve('alice',2,'request_portal_123456789','quantity-update');
  f.docs.get('siteMailCapacityHolds/alice').createdAt='2020-01-01T00:00:00Z';
  await f.service.releaseCheckout({uid:'alice',sessionId:'cs_fake'});
  await assert.rejects(f.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
});
test('malformed indexes, foreign account records, invalid quantities and invalid provider results cannot create extra capacity',async()=>{
  const f=fixture();
  for(const quantity of [0,1.5,Number.MAX_SAFE_INTEGER+1,'2'])await assert.rejects(f.reserve('alice',quantity),error=>error.code==='INVALID_CAPACITY_REQUEST');
  f.docs.set('siteMailUserAccounts/alice',{mailboxIds:['alice','alice']});
  await assert.rejects(f.reserve('alice',1),error=>error.code==='MAIL_CAPACITY_REVIEW_REQUIRED');
  f.docs.set('siteMailUserAccounts/alice',{mailboxIds:['alice']});f.docs.set('siteMailboxes/alice',{uid:'other',provider:'hostinger',status:'active'});
  assert.ok(await f.reserve('alice',1));assert.equal((await f.service.status()).reserved,1);
  const g=fixture();g.provider.assertCapacity=async()=>false;
  await assert.rejects(g.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');assert.equal(g.docs.size,0);
});
test('capacity binding cannot replace another Checkout or an unrelated reservation',async()=>{
  const f=fixture();const reservationId=await f.reserve('alice',1);
  await assert.rejects(f.service.bindCheckout({uid:'alice',reservationId:'wrong',sessionId:'cs_first'}),error=>error.code==='MAIL_CAPACITY_REVIEW_REQUIRED');
  await f.service.bindCheckout({uid:'alice',reservationId,sessionId:'cs_first'});
  await assert.rejects(f.service.bindCheckout({uid:'alice',reservationId,sessionId:'cs_second'}),error=>error.code==='MAIL_CAPACITY_REVIEW_REQUIRED');
});
test('test-mode billing and other providers never reserve real Hostinger seats',()=>{
  assert.equal(createMailCapacityService({config:{liveMode:false,mailProvider:'hostinger'}}),null);
  assert.equal(createMailCapacityService({config:{liveMode:true,mailProvider:'migadu'}}),null);
});

test('accounts can reserve and fulfill more than twenty paid email addresses',async()=>{
  const f=fixture({capacity:75});
  await f.reserve('alice',60);f.paid('alice',60);f.boxes('alice',60);
  await f.service.settle({uid:'alice'});
  assert.equal((await f.service.status()).reserved,0);
  await f.reserve('bob',15);
  assert.equal((await f.service.status()).available,0);
  await assert.rejects(f.reserve('charlie',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
});


test('owner trial provisioning cannot consume seats held by an unpaid customer',async()=>{
  const policy={ownerTrialEnabled:true,ownerTrialExpiresAt:new Date(moment+86400000).toISOString(),ownerTrialMailboxes:1,mailReady:true};
  const f=fixture({capacity:2,policy});await f.reserve('alice',2);
  await assert.rejects(f.service.reserveTrial({user:{uid:'owner',email:'taithai5002@gmail.com',email_verified:true},quantity:1}),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
  assert.equal(f.docs.has('siteMailCapacityHolds/owner'),false);
});
test('a real owner trial also reserves against live paid stock when billing is in a Sandbox',async()=>{
  const policy={liveMode:false,ownerTrialEnabled:true,ownerTrialExpiresAt:new Date(moment+86400000).toISOString(),ownerTrialMailboxes:1,mailReady:true};
  const f=fixture({capacity:2,policy});f.paid('alice',2);
  f.docs.set('siteMailCapacityHolds/alice',{uid:'alice',provider:'hostinger',pendingQuantity:0,active:true});
  await assert.rejects(f.service.reserveTrial({user:{uid:'owner',email:'taithai5002@gmail.com',email_verified:true},quantity:1}),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
  await assert.rejects(f.reserve('bob',1),error=>error.code==='LIVE_CAPACITY_REQUIRED');
});
test('trial reservations share the same physical pool and cannot be claimed by a non-owner or larger client quantity',async()=>{
  const policy={ownerTrialEnabled:true,ownerTrialExpiresAt:new Date(moment+86400000).toISOString(),ownerTrialMailboxes:1,mailReady:true};
  const f=fixture({capacity:2,policy}),user={uid:'owner',email:'taithai5002@gmail.com',email_verified:true};
  for(const input of [{user:{...user,email:'other@example.com'},quantity:1},{user:{...user,email_verified:false},quantity:1},{user,quantity:2}])await assert.rejects(f.service.reserveTrial(input),error=>error.code==='OWNER_TRIAL_REQUIRED');
  assert.equal(await f.service.reserveTrial({user,quantity:1}),true);
  assert.equal(await f.service.reserveTrial({user,quantity:1}),true);
  await f.reserve('alice',1);
  await assert.rejects(f.reserve('bob',1),error=>error.code==='MAIL_PROVIDER_CAPACITY_REACHED');
  assert.equal((await f.service.status()).reserved,2);
});
