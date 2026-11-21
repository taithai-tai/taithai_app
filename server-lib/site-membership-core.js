import { createHash, randomUUID } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { mailConfiguration } from './site-mail.js';
import { SITE_ADMIN_OWNER } from './site-admin-access.js';

export const MEMBERSHIP_PROJECT = 'gen-lang-client-0141234491';
export const MEMBERSHIP_DATABASE = 'ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb';
export const MEMBERSHIP_OWNER = SITE_ADMIN_OWNER;
// Numeric integrity guard only; membership has no fixed mailbox-count tier.
export const MAX_MEMBERSHIP_MAILBOXES = Number.MAX_SAFE_INTEGER;
export const MEMBERSHIP_PLAN = Object.freeze({ amount:9900, unitAmount:9900, currency:'thb', interval:'month', mailboxes:1, domain:'taithai.app' });
export const PRIVATE_API_HEADERS = Object.freeze({
  'Cache-Control':'private, no-store, max-age=0', 'CDN-Cache-Control':'no-store', 'Vercel-CDN-Cache-Control':'no-store',
  'Content-Type':'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex, nofollow, noarchive',
});
export class MembershipError extends Error {
  constructor(code, status=503) { super(code); this.code=code; this.status=status; }
}
export const isMembershipOwner = user => Boolean(user?.email_verified === true && String(user.email || '').toLowerCase() === MEMBERSHIP_OWNER);
export function ownerMailTrialAllowed(user,config,now=Date.now()) {
  const end=Date.parse(config?.ownerTrialExpiresAt || '');
  return isMembershipOwner(user) && config?.ownerTrialEnabled===true && config?.mailReady===true && ['purelymail','hostinger'].includes(config?.mailProvider)
    && Number.isFinite(end) && end>now && end<=now+31*86400000;
}
export function liveMailMembership(record,config,now=Date.now()) {
  const end=Date.parse(record?.currentPeriodEnd || '');
  return config?.liveMode===true && record?.livemode===true && record.active===true && record.paid===true && record.riskBlocked!==true
    && record.planId==='mailbox-99' && record.amount===9900 && record.currency==='thb'
    && Number.isSafeInteger(record.mailboxes) && record.mailboxes>=1 && record.mailboxes<=MAX_MEMBERSHIP_MAILBOXES
    && (record.quantity===undefined || record.quantity===record.mailboxes)
    && Number.isFinite(end) && end>now ? record : {active:false,paid:false};
}

export function membershipConfig(env=process.env) {
  const secret = env.STRIPE_SECRET_KEY || '';
  const stripeConfigured = /^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/.test(secret) && Boolean(env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET);
  const databaseConfigured = Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  const mail = mailConfiguration(env), mailConfigured = mail.ready;
  const ownerMailEnabled=env.OWNER_MAIL_ENABLED==='true';
  const ownerMailOrigin=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.netlify\.app$/.test(env.OWNER_MAIL_ORIGIN || '')?env.OWNER_MAIL_ORIGIN:null;
  return {
    ...MEMBERSHIP_PLAN, baseUrl:'https://taithai.app', priceId:env.STRIPE_PRICE_ID || '',
    webhookSecret:env.STRIPE_WEBHOOK_SECRET || '', apiVersion:'2026-11-18.endive',
    portalConfigurationId:env.STRIPE_PORTAL_CONFIGURATION_ID || '',
    quantityPortalConfigurationId:env.STRIPE_QUANTITY_PORTAL_CONFIGURATION_ID || '',
    quantityUpdatesVerified:false,
    testMode:/^(?:sk|rk)_test_/.test(secret), stripeConfigured, databaseConfigured,
    mailConfigured, mailReady:mailConfigured && databaseConfigured, mailProvider:mail.provider,
    adminOnly:true,ownerMailEnabled,ownerMailOrigin,
    salesEnabled:false,ownerTrialEnabled:false,ownerTrialExpiresAt:null,ownerTrialMailboxes:0,ownerTrialOrigin:null,
    databaseReady:databaseConfigured, liveMode:! /^(?:sk|rk)_test_/.test(secret),
    ready:ownerMailEnabled && databaseConfigured && mailConfigured,
  };
}

export function initializeMembershipDatabase(env=process.env) {
  let account;
  try {
    const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON || Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8');
    account = JSON.parse(raw);
    if (account.project_id !== MEMBERSHIP_PROJECT || typeof account.client_email !== 'string' || typeof account.private_key !== 'string') throw Error();
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  } catch { throw new MembershipError('MEMBERSHIP_DATABASE_NOT_CONFIGURED'); }
  const name = 'taithai-membership';
  const app = getApps().find(item => item.name === name) || initializeApp({ credential:cert(account), projectId:MEMBERSHIP_PROJECT }, name);
  return { auth:getAuth(app), store:createMembershipStore(getFirestore(app, MEMBERSHIP_DATABASE)) };
}

function documentPath(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_.:-]+(?:\/[A-Za-z0-9_.:-]+)+$/.test(path) || path.split('/').length % 2 !== 0 || path.length > 512) throw new MembershipError('INVALID_STORAGE_PATH', 400);
  return path;
}
export function createMembershipStore(db, {now=()=>Date.now(),uuid=randomUUID}={}) {
  const doc = path => db.doc(documentPath(path));
  const read = snapshot => snapshot.exists ? snapshot.data() : null;
  const wrapTransaction = tx => ({
    get:async path => read(await tx.get(doc(path))),
    set:(path,value,options) => options ? tx.set(doc(path),value,options) : tx.set(doc(path),value),
    create:(path,value) => tx.create(doc(path),value),
    delete:path => tx.delete(doc(path)),
  });
  const store = {
    get:async path => read(await doc(path).get()),
    set:(path,value,options) => options ? doc(path).set(value,options) : doc(path).set(value),
    create:(path,value) => doc(path).create(value),
    delete:path => doc(path).delete(),
    async list(collection, {where=[],limit=100,orderBy,startAfter}={}) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(collection)) throw new MembershipError('INVALID_STORAGE_PATH',400);
      let query=db.collection(collection);
      for (const [field,operator,value] of where) query=query.where(field,operator,value);
      const orders=orderBy?(Array.isArray(orderBy[0])?orderBy:[orderBy]):[];
      for(const [field,direction='asc'] of orders)query=query.orderBy(field==='__name__'?FieldPath.documentId():field,direction);
      if(startAfter!==undefined) {
        if(!Array.isArray(startAfter) || startAfter.length!==orders.length || !orders.length)throw new MembershipError('INVALID_STORAGE_CURSOR',400);
        query=query.startAfter(...startAfter);
      }
      const result=await query.limit(Math.max(1,Math.min(500,limit))).get();
      return result.docs.map(item => ({...item.data(),id:item.id}));
    },
    transaction:fn => db.runTransaction(tx => fn(wrapTransaction(tx))),
    runTransaction:fn => db.runTransaction(tx => fn(wrapTransaction(tx))),
    async withLock(key,fn) {
      const path=`siteMembershipLocks/${createHash('sha256').update(String(key)).digest('hex')}`;
      const token=uuid();
      await store.transaction(async tx => {
        const previous=await tx.get(path);
        if (previous?.expiresAt > now()) throw new MembershipError('OPERATION_IN_PROGRESS',409);
        tx.set(path,{token,expiresAt:now()+120000,expireAt:new Date(now()+240000)});
      });
      let leaseLost=false,renewing=null;
      const renewal=setInterval(()=>{
        if(renewing)return;
        renewing=store.transaction(async tx=>{
          const current=await tx.get(path);
          if(current?.token!==token || current.expiresAt<=now())throw new MembershipError('OPERATION_UNCERTAIN');
          tx.set(path,{token,expiresAt:now()+120000,expireAt:new Date(now()+240000)});
        }).catch(()=>{leaseLost=true;}).finally(()=>{renewing=null;});
      },30000);
      renewal.unref?.();
      try { const result=await fn();if(leaseLost)throw new MembershipError('OPERATION_UNCERTAIN');return result; }
      finally {
        clearInterval(renewal);
        await renewing;
        // A stale worker cannot release another request's replacement lease.
        await store.transaction(async tx => { const current=await tx.get(path); if(current?.token===token) tx.delete(path); }).catch(()=>{});
      }
    },
  };
  return store;
}

// Test-mode invoices and customers cannot become live entitlements when keys
// change. Real mailboxes always remain in the live, unprefixed collections.
export function membershipBillingStore(store,{testMode=false}={}) {
  if(!testMode)return store;
  const collection=name=>name==='siteMemberships'||name.startsWith('siteBilling')?name.replace(/^site/,'siteTest'):name;
  const path=value=>{const [name,...rest]=value.split('/');return [collection(name),...rest].join('/');};
  const tx=transaction=>({get:key=>transaction.get(path(key)),set:(key,value,options)=>transaction.set(path(key),value,options),create:(key,value)=>transaction.create(path(key),value),delete:key=>transaction.delete(path(key))});
  return {
    get:key=>store.get(path(key)),set:(key,value,options)=>store.set(path(key),value,options),create:(key,value)=>store.create(path(key),value),delete:key=>store.delete(path(key)),
    list:(name,options)=>store.list(collection(name),options),
    transaction:fn=>store.transaction(transaction=>fn(tx(transaction))),runTransaction:fn=>store.runTransaction(transaction=>fn(tx(transaction))),
    withLock:(key,fn)=>store.withLock(`test:${key}`,fn),
  };
}

export async function verifyMembershipUser(authorization,{auth}={}) {
  const token=/^Bearer ([A-Za-z0-9_.-]{20,8000})$/.exec(authorization || '')?.[1];
  if (!token) throw new MembershipError('AUTH_REQUIRED',401);
  let user;
  try { user=await auth.verifyIdToken(token,true); }
  catch { throw new MembershipError('AUTH_REQUIRED',401); }
  if (!user?.uid || user.email_verified !== true || typeof user.email !== 'string') throw new MembershipError('VERIFIED_ACCOUNT_REQUIRED',403);
  return user;
}

export async function consumeMembershipRate(store,user,scope,{limit=10,windowMs=60000,now=Date.now()}={}) {
  const bucket=Math.floor(now/windowMs);
  const id=createHash('sha256').update(`${user.uid}:${scope}:${bucket}`).digest('hex');
  await store.transaction(async tx => {
    const path=`siteMembershipRateLimits/${id}`, record=await tx.get(path);
    if ((record?.count || 0)>=limit) throw new MembershipError('TOO_MANY_REQUESTS',429);
    tx.set(path,{count:(record?.count || 0)+1,expiresAt:now+windowMs*2,expireAt:new Date(now+windowMs*2)});
  });
}

export async function readMembershipBody(req,{maximum=262144,raw=false}={}) {
  let bytes;
  if (Buffer.isBuffer(req.body)) bytes=req.body;
  else if (typeof req.body==='string') bytes=Buffer.from(req.body);
  else if (req.body && typeof req.body==='object') {
    if(raw) throw new MembershipError('WEBHOOK_RAW_BODY_REQUIRED',400);
    bytes=Buffer.from(JSON.stringify(req.body));
  } else {
    const chunks=[]; let size=0;
    for await(const chunk of req) { const data=Buffer.from(chunk);size+=data.length;if(size>maximum)throw new MembershipError('REQUEST_TOO_LARGE',413);chunks.push(data); }
    bytes=Buffer.concat(chunks);
  }
  if(bytes.length>maximum)throw new MembershipError('REQUEST_TOO_LARGE',413);
  if(raw)return bytes;
  try { const value=JSON.parse(bytes.toString('utf8') || '{}');if(!value || typeof value!=='object' || Array.isArray(value))throw Error();return value; }
  catch {throw new MembershipError('INVALID_REQUEST',400);}
}

export function membershipResponse(res,data,status=200) {
  res.writeHead(status,PRIVATE_API_HEADERS);
  res.end(JSON.stringify(data));
}
export function membershipFailure(res,error) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code || '') ? error.code : 'SERVICE_UNAVAILABLE';
  const status=[400,401,403,404,405,409,413,429,502,503].includes(error?.status) ? error.status : 503;
  const message=status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':status===403?'บัญชีนี้ยังไม่มีสิทธิ์ดำเนินการ':status===429?'ทำรายการบ่อยเกินไป กรุณารอสักครู่':status===503?'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง':'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง';
  membershipResponse(res,{error:{code,message}},status);
}
