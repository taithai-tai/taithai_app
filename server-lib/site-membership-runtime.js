import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { resolveMx } from 'node:dns/promises';
import { initializeMembershipDatabase, membershipConfig, MembershipError } from './site-membership-core.js';
import { createSiteMail, createMailProvider, createMailProtocolAdapters, MAIL_PROVIDER_SETTINGS } from './site-mail.js';
import { createOwnerMailCapacityService } from './site-mail-capacity.js';
import { createAdminAccess } from './site-admin-access.js';

export function membershipMailEntitlement({resolveAccess}) {
  if(typeof resolveAccess!=='function')throw new TypeError('Trusted admin access resolver required');
  return async (uid,{user}={})=>{
    if(user?.uid!==uid)return {active:false,paid:false,ownerAccess:false,adminAccess:false,mailAccess:false,adminOnly:true,ownerTrial:false};
    const access=await resolveAccess(user);
    return {...access,active:access.mailAccess===true,paid:false,adminOnly:true,ownerTrial:false};
  };
}

let runtime;
export function getMembershipRuntime() {
  if (runtime) return runtime;
  const config=membershipConfig();
  if(!config.databaseReady)throw new MembershipError('MEMBERSHIP_DATABASE_NOT_CONFIGURED');
  const {store,auth}=initializeMembershipDatabase();
  const adminAccess=createAdminAccess({store,auth});
  const resolveAccess=adminAccess.resolveAccess;
  const protocols=createMailProtocolAdapters({ImapFlow,createTransport:nodemailer.createTransport,simpleParser,env:process.env});
  const provider=config.mailProvider?createMailProvider({env:process.env,verifyMailboxCredentials:protocols.imap.verifyCredentials}):null;
  const capacity=config.mailReady?createOwnerMailCapacityService({store,provider,config,resolveAccess}):null;
  const mail=createSiteMail({store,getMembership:membershipMailEntitlement({resolveAccess}),provider,...protocols,
    capacityStatus:capacity?.status,withProvisioningLock:capacity?.withProvisioningLock,env:process.env});
  runtime={store,auth,adminAccess,resolveAccess,mail,provider,capacity,config};
  return runtime;
}

// MAIL_READY is an operator setup flag. The deployment preflight verifies
// public routing without creating a mailbox or sending a message.
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
