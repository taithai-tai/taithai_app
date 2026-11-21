import { createHash } from 'node:crypto';
import { liveMailMembership, ownerMailTrialAllowed, MAX_MEMBERSHIP_MAILBOXES, MembershipError } from './site-membership-core.js';

// Permanent delegated-admin mail consumes real provider seats. Uncertain POSTs
// retain a global hold without an assumed expiry, including after revocation.
// The archived payment capacity ledger below is never used by this runtime.
export function createOwnerMailCapacityService({store,provider,config,resolveAccess,now=()=>Date.now()}={}) {
  if(config?.mailProvider!=='hostinger')return null;
  const ledgerPath='siteMailProvisioningLedger/hostinger';
  const safeId=value=>typeof value==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
  const reject=code=>{throw new MembershipError(code,code==='MAIL_ACCESS_REQUIRED'?403:503);};
  async function authorize(user) {
    if(typeof resolveAccess!=='function' || !(await resolveAccess(user)).mailAccess)reject('MAIL_ACCESS_REQUIRED');
    if(config.ownerMailEnabled!==true || config.mailReady!==true)reject('OWNER_MAIL_NOT_ENABLED');
  }
  function inventory(value) {
    if(!Number.isSafeInteger(value?.capacity) || value.capacity<1 || !Number.isSafeInteger(value.used) || value.used<0
      || !Number.isSafeInteger(value.available) || value.available<0 || value.available>value.capacity || value.used+value.available>value.capacity)reject('MAIL_CAPACITY_REVIEW_REQUIRED');
    return value;
  }
  async function holds() {
    const ledger=await store.get(ledgerPath);
    if(ledger && (ledger.provider!=='hostinger' || !Array.isArray(ledger.holds) || ledger.holds.length>500))reject('MAIL_CAPACITY_REVIEW_REQUIRED');
    const rows=ledger?.holds || [],keys=new Set();
    for(const row of rows) {
      if(!safeId(row.uid) || !safeId(row.mailboxId) || typeof row.address!=='string' || !/^[a-z0-9][a-z0-9.]{1,28}[a-z0-9]@taithai\.app$/.test(row.address)
        || keys.has(row.mailboxId))reject('MAIL_CAPACITY_REVIEW_REQUIRED');
      keys.add(row.mailboxId);
    }
    // A recorded active mailbox has already passed provider ownership proof;
    // it is physically counted in inventory, so a lost hold-release response
    // must not count that same seat twice. Unknown/pending records stay held.
    const pending=[];
    for(const row of rows) {
      const record=await store.get(row.mailboxId===row.uid?`siteMailboxes/${row.uid}`:`siteMailAccounts/${row.mailboxId}`);
      if(record?.uid===row.uid && record.provider==='hostinger' && record.address===row.address && record.status==='active')continue;
      pending.push(row);
    }
    return pending;
  }
  async function save(rows) {await store.set(ledgerPath,{provider:'hostinger',holds:rows,updatedAt:new Date(now()).toISOString()});}
  function validRecord(user,record) {
    if(record?.uid!==user.uid || !safeId(record.id) || record.provider!=='hostinger' || typeof record.address!=='string' || !/^[a-z0-9][a-z0-9.]{1,28}[a-z0-9]@taithai\.app$/.test(record.address))reject('MAIL_CAPACITY_REVIEW_REQUIRED');
  }
  return {
    async status(user) {
      await authorize(user);
      if(!store?.get || typeof provider?.inventory!=='function')reject('MAIL_CAPACITY_NOT_CONFIGURED');
      const stock=inventory(await provider.inventory()),rows=await holds();
      return {capacity:stock.capacity,used:stock.used,reserved:rows.length,available:Math.max(0,stock.available-rows.length)};
    },
    async withProvisioningLock(user,operation) {
      await authorize(user);
      if(!store?.withLock || !store?.get || !store?.set || typeof provider?.inventory!=='function')reject('MAIL_CAPACITY_NOT_CONFIGURED');
      return store.withLock('hostinger-admin-mail-provisioning',async()=>{
        await authorize(user);
        return operation({
          async reserve(record) {
            await authorize(user);validRecord(user,record);
            const rows=await holds(),own=rows.find(row=>row.mailboxId===record.id);
            if(own && (own.uid!==user.uid || own.address!==record.address))reject('MAIL_CAPACITY_REVIEW_REQUIRED');
            const stock=inventory(await provider.inventory());
            if(stock.available < rows.length-(own?1:0)+1)reject('MAIL_PROVIDER_CAPACITY_REACHED');
            if(!own) {
              if(rows.length>=500)reject('MAIL_CAPACITY_REVIEW_REQUIRED');
              rows.push({uid:user.uid,mailboxId:record.id,address:record.address,createdAt:new Date(now()).toISOString()});
            }
            await save(rows);
          },
          async complete(record) {
            validRecord(user,record);
            const rows=await holds();
            await save(rows.filter(row=>row.mailboxId!==record.id));
          },
        });
      });
    },
  };
}

const validUid=value=>typeof value==='string' && /^[A-Za-z0-9:_-]{1,128}$/.test(value);
const validQuantity=value=>Number.isSafeInteger(value) && value>=1 && value<=MAX_MEMBERSHIP_MAILBOXES;
const fail=code=>{throw new MembershipError(code);};
const holdPath=uid=>`siteMailCapacityHolds/${uid}`;

// Holds represent purchased provider seats which a paid or pending customer has
// not provisioned yet. No method buys seats or expires a payment by assumption.
export function createMailCapacityService({store,provider,config,now=()=>Date.now()}={}) {
  if(config?.mailProvider!=='hostinger' || config.liveMode!==true && config.ownerTrialEnabled!==true)return null;
  if(!store?.withLock || !store?.list || !provider?.inventory || !provider?.assertCapacity)fail('MAIL_CAPACITY_NOT_CONFIGURED');
  async function fulfilled(uid) {
    const index=await store.get(`siteMailUserAccounts/${uid}`);
    let ids=index?.mailboxIds;
    if(ids===undefined)ids=[uid];
    if(!Array.isArray(ids) || ids.length>MAX_MEMBERSHIP_MAILBOXES || new Set(ids).size!==ids.length
      || ids.some(id=>!validUid(id)))fail('MAIL_CAPACITY_REVIEW_REQUIRED');
    let count=0;
    for(let offset=0;offset<ids.length;offset+=25){
      const records=await Promise.all(ids.slice(offset,offset+25).map(id=>store.get(id===uid?`siteMailboxes/${uid}`:`siteMailAccounts/${id}`)));
      count+=records.filter(record=>record?.uid===uid && record.provider==='hostinger' && record.status==='active').length;
    }
    return count;
  }
  async function measure(row,uid) {
    if(!validUid(uid))fail('MAIL_CAPACITY_REVIEW_REQUIRED');
    const [record,used]=await Promise.all([store.get(`siteMemberships/${uid}`),fulfilled(uid)]);
    // This is real provider inventory even when the owner trial page uses a
    // Stripe Sandbox. Always account for other customers' live paid holds.
    const member=liveMailMembership(record,{...config,liveMode:true},now());
    const paid=member.active===true?member.mailboxes:0;
    const pending=row?.pendingQuantity || 0;
    if(pending!==0 && !validQuantity(pending))fail('MAIL_CAPACITY_REVIEW_REQUIRED');
    const trial=row?.trialQuantity || 0,trialEnd=Date.parse(row?.trialExpiresAt || '');
    if(trial!==0 && (![1,2].includes(trial) || !Number.isFinite(trialEnd)))fail('MAIL_CAPACITY_REVIEW_REQUIRED');
    // The expiry belongs to a server-granted unpaid trial, not a guessed
    // lifetime for a still-payable Stripe confirmation.
    const activeTrial=trialEnd>now()?trial:0;
    return {uid,paid,used,pending,trial:activeTrial,unfulfilled:Math.max(0,Math.max(paid,pending,activeTrial)-used)};
  }
  async function activeHolds() {
    const rows=await store.list('siteMailCapacityHolds',{where:[['active','==',true]],limit:101});
    if(!Array.isArray(rows) || rows.length>100)fail('MAIL_CAPACITY_REVIEW_REQUIRED');
    return rows;
  }
  async function reserve({uid,quantity,requestId,kind}={}) {
    if(config.liveMode!==true)fail('LIVE_CAPACITY_REQUIRED');
    if(!validUid(uid) || !validQuantity(quantity) || !['checkout','quantity-update'].includes(kind)
      || typeof requestId!=='string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail('INVALID_CAPACITY_REQUEST');
    return store.withLock('hostinger-mail-capacity',async()=>{
      const previous=await store.get(holdPath(uid));
      const own=await measure(previous,uid);
      if(previous?.provider && previous.provider!=='hostinger')fail('MAIL_CAPACITY_REVIEW_REQUIRED');
      if(own.pending>own.paid && (own.pending!==quantity || previous.kind!==kind))fail('MAIL_CAPACITY_PENDING');
      const rows=await activeHolds();
      let needed=Math.max(0,Math.max(own.paid,quantity,own.trial)-own.used);
      for(const row of rows) {
        if(row.uid===uid)continue;
        const measured=await measure(row,row.uid);
        needed+=measured.unfulfilled;
        if(measured.unfulfilled===0 && measured.pending===0 && measured.trial===0)await store.set(holdPath(row.uid),{active:false,updatedAt:new Date(now()).toISOString()},{merge:true});
      }
      if(await provider.assertCapacity(needed)!==true)fail('MAIL_PROVIDER_CAPACITY_REACHED');
      const reservationId=own.pending>own.paid && previous.reservationId?previous.reservationId
        :'cap_'+createHash('sha256').update(`${uid}:${kind}:${requestId}`).digest('hex').slice(0,40);
      await store.set(holdPath(uid),{
        uid,provider:'hostinger',kind,reservationId,pendingQuantity:quantity,
        // A refreshed Portal confirmation retains the same reserved target.
        sessionId:reservationId===previous?.reservationId?previous.sessionId || null:null,
        trialQuantity:previous?.trialQuantity || 0,trialExpiresAt:previous?.trialExpiresAt || null,
        active:true,createdAt:previous?.createdAt || new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString(),
      });
      return reservationId;
    });
  }
  async function reserveTrial({user,quantity}={}) {
    if(!validUid(user?.uid) || !ownerMailTrialAllowed(user,config,now()) || ![1,2].includes(quantity)
      || quantity!==(config.ownerTrialMailboxes || 1))fail('OWNER_TRIAL_REQUIRED');
    const uid=user.uid;
    return store.withLock('hostinger-mail-capacity',async()=>{
      const previous=await store.get(holdPath(uid)),own=await measure(previous,uid);
      const rows=await activeHolds();let needed=Math.max(0,Math.max(own.paid,own.pending,quantity)-own.used);
      for(const row of rows)if(row.uid!==uid)needed+=(await measure(row,row.uid)).unfulfilled;
      if(await provider.assertCapacity(needed)!==true)fail('MAIL_PROVIDER_CAPACITY_REACHED');
      await store.set(holdPath(uid),{...previous,uid,provider:'hostinger',kind:previous?.kind || 'owner-trial',
        pendingQuantity:previous?.pendingQuantity || 0,trialQuantity:quantity,trialExpiresAt:config.ownerTrialExpiresAt,
        active:true,createdAt:previous?.createdAt || new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString()});
      return true;
    });
  }
  async function bindCheckout({uid,reservationId,sessionId}={}) {
    if(!validUid(uid) || typeof sessionId!=='string' || !/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId))fail('INVALID_CAPACITY_REQUEST');
    await store.transaction(async tx=>{
      const current=await tx.get(holdPath(uid));
      if(current?.reservationId!==reservationId || current.kind!=='checkout')fail('MAIL_CAPACITY_REVIEW_REQUIRED');
      if(current.sessionId && current.sessionId!==sessionId)fail('MAIL_CAPACITY_REVIEW_REQUIRED');
      tx.set(holdPath(uid),{...current,sessionId,updatedAt:new Date(now()).toISOString()});
    });
  }
  async function settle({uid}={}) {
    if(!validUid(uid))fail('INVALID_CAPACITY_REQUEST');
    await store.withLock('hostinger-mail-capacity',async()=>{
      const row=await store.get(holdPath(uid));if(!row)return;
      const measured=await measure(row,uid);
      const pending=measured.paid>=measured.pending?0:measured.pending;
      await store.set(holdPath(uid),{pendingQuantity:pending,active:Math.max(measured.paid,pending,measured.trial)>measured.used,updatedAt:new Date(now()).toISOString()},{merge:true});
    });
  }
  // Only billing's signed-event/fresh-Stripe-expired path may call this. A
  // browser cancel redirect, timeout, or guessed Portal lifetime cannot release.
  async function releaseCheckout({uid,sessionId}={}) {
    if(!validUid(uid) || typeof sessionId!=='string')fail('INVALID_CAPACITY_REQUEST');
    await store.withLock('hostinger-mail-capacity',async()=>{
      const row=await store.get(holdPath(uid));
      if(!row || row.kind!=='checkout' || row.sessionId!==sessionId)return;
      const measured=await measure({...row,pendingQuantity:0},uid);
      await store.set(holdPath(uid),{pendingQuantity:0,active:Math.max(measured.paid,measured.trial)>measured.used,updatedAt:new Date(now()).toISOString()},{merge:true});
    });
  }
  async function status() {
    const inventory=await provider.inventory();const rows=await activeHolds();
    let reserved=0,pendingCustomers=0;
    for(const row of rows){const item=await measure(row,row.uid);reserved+=item.unfulfilled;if(item.pending>item.paid)pendingCustomers++;}
    return {provider:'hostinger',capacity:inventory.capacity,used:inventory.used,reserved,
      available:Math.max(0,inventory.available-reserved),pendingCustomers};
  }
  return {reserve,reserveTrial,bindCheckout,releaseCheckout,settle,status};
}
