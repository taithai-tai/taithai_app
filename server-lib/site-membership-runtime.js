import Stripe from 'stripe';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { resolveMx } from 'node:dns/promises';
import { initializeMembershipDatabase, membershipConfig, membershipBillingStore, liveMailMembership, ownerMailTrialAllowed, MembershipError } from './site-membership-core.js';
import { createBillingService } from './site-billing.js';
import { createSiteMail, createMailProvider, createMailProtocolAdapters, MAIL_PROVIDER_SETTINGS } from './site-mail.js';
import { createMailCapacityService } from './site-mail-capacity.js';
import { createMembershipFetch, MEMBERSHIP_REMOTE_TIMEOUT_MS } from './site-operation-budget.js';

export function membershipMailEntitlement({store,config,now=()=>Date.now()}) {
  return async (uid,{user}={})=>{
    if(config.liveMode) {
      const member=liveMailMembership(await store.get(`siteMemberships/${uid}`),config,now());
      if(member.active)return member;
    }
    if(user?.uid===uid && ownerMailTrialAllowed(user,config,now()))return {active:true,paid:false,ownerTrial:true,expiresAt:config.ownerTrialExpiresAt,mailboxes:config.ownerTrialMailboxes || 1};
    return {active:false,paid:false};
  };
}

let runtime;
export function getMembershipRuntime() {
  if (runtime) return runtime;
  const config=membershipConfig();
  if(!config.databaseReady)throw new MembershipError('MEMBERSHIP_DATABASE_NOT_CONFIGURED');
  const {store,auth}=initializeMembershipDatabase();
  const stripe=process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:config.apiVersion,
    timeout:MEMBERSHIP_REMOTE_TIMEOUT_MS,maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(createMembershipFetch())}) : null;
  const protocols=createMailProtocolAdapters({ImapFlow,createTransport:nodemailer.createTransport,simpleParser,env:process.env});
  const provider=config.mailProvider?createMailProvider({env:process.env,verifyMailboxCredentials:protocols.imap.verifyCredentials}):null;
  const capacity=config.mailReady?createMailCapacityService({store,provider,config}):null;
  const billing=createBillingService({stripe,store:membershipBillingStore(store,config),config,capacity:config.liveMode?capacity:null});
  const mail=createSiteMail({store,getMembership:membershipMailEntitlement({store,config}),provider,...protocols,reserveTrialCapacity:capacity?.reserveTrial,env:process.env});
  runtime={store,auth,billing,mail,provider,capacity,config};
  return runtime;
}

// MAIL_READY is an operator's verified setup flag. A live purchase also checks
// actual public routing, so the previous GoDaddy MX cannot receive new members.
export async function assertMembershipMailRouting({resolve=resolveMx,config=membershipConfig(),provider,timeoutMs=4000}={}) {
  if(!config.mailReady)throw new MembershipError('MAIL_NOT_READY');
  let timer;
  try {
    const records=await Promise.race([resolve('taithai.app'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new MembershipError('MAIL_NOT_READY')),timeoutMs);})]);
    const hosts=MAIL_PROVIDER_SETTINGS[config.mailProvider || 'migadu']?.expectedMxHosts || [];
    const allowed=new Set(hosts);
    if(!hosts.length || !Array.isArray(records) || records.length!==hosts.length || records.some(item=>!allowed.has(String(item.exchange).toLowerCase().replace(/\.$/,''))) || new Set(records.map(item=>String(item.exchange).toLowerCase().replace(/\.$/,''))).size!==hosts.length)throw new MembershipError('MAIL_NOT_READY');
    if(!provider?.assertReady || await provider.assertReady()!==true)throw new MembershipError('MAIL_NOT_READY');
  } catch {throw new MembershipError('MAIL_NOT_READY');}
  finally {clearTimeout(timer);}
}
