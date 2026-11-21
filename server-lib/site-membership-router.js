import { membershipConfig, PRIVATE_API_HEADERS, MembershipError, verifyMembershipUser, consumeMembershipRate } from './site-membership-core.js';
import { getMembershipRuntime } from './site-membership-runtime.js';
import { verifyOwnerToken } from './site-app-gate.js';
import { withMembershipOperationBudget, assertMembershipOperationActive, MEMBERSHIP_OPERATION_TIMEOUT_MS } from './site-operation-budget.js';

const GET_ACTIONS=new Set(['status','mailboxes','folders','messages','message','aliases','admin-status']);
const POST_ACTIONS=new Set(['mailbox-create','send','message-flags','alias-create','alias-delete','receiving-name-save','receiving-name-hide','mail-connection-check']);
const BILLING_ACTIONS=new Set(['checkout','quantity-update','portal','admin-discounts','admin-discount-create','admin-discount-disable']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:PRIVATE_API_HEADERS});
function failure(error) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code || '')?error.code:'SERVICE_UNAVAILABLE';
  const status=[400,401,403,404,405,409,413,429,502,503].includes(error?.status)?error.status:503;
  const message=status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':status===403?'บัญชีนี้ยังไม่มีสิทธิ์ดำเนินการ':status===429?'ทำรายการบ่อยเกินไป กรุณารอสักครู่':status===503?'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง':'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง';
  return json({error:{code,message}},status);
}
function boundedMembershipHandler(handler,timeoutMs) {
  return async request=>{
    try {return await withMembershipOperationBudget(()=>handler(request),{timeoutMs,signal:request.signal});}
    catch(error){return failure(error);}
  };
}
export async function readMembershipRequest(request,{maximum=262144,raw=false}={}) {
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared) && declared>maximum)throw new MembershipError('REQUEST_TOO_LARGE',413);
  const reader=request.body?.getReader();const chunks=[];let size=0;
  if(reader)try {
    for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maximum){await reader.cancel();throw new MembershipError('REQUEST_TOO_LARGE',413);}chunks.push(Buffer.from(item.value));}
  } finally {reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  if(raw)return bytes;
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new MembershipError('JSON_REQUIRED',400);
  try {const value=JSON.parse(bytes.toString('utf8')||'{}');if(!value || typeof value!=='object' || Array.isArray(value))throw Error();return value;}
  catch{throw new MembershipError('INVALID_REQUEST',400);}
}
function writeOrigin(request,production,config) {
  const origin=request.headers.get('origin'),actual=new URL(request.url).origin;
  if(origin!==actual)throw new MembershipError('ORIGIN_NOT_ALLOWED',403);
  if(origin==='https://taithai.app' || config.ownerMailOrigin && origin===config.ownerMailOrigin)return;
  if(!production && /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(origin))return;
  throw new MembershipError('ORIGIN_NOT_ALLOWED',403);
}
function unavailable(config) {
  return {ready:false,adminOnly:true,ownerAccess:false,adminAccess:false,mailAccess:false,paid:false,ownerTrial:false,membership:null,mailReady:config.mailReady,
    mailProvider:config.mailProvider,mailbox:null,mailboxes:[],pendingMailboxes:[],mailboxCapacity:0,mailboxUsed:0,mailboxAvailable:0,capacityAvailable:false,
    canCreate:false,canSend:false,canRetryProvisioning:false,canManageMessages:false,
    capabilities:{checkout:false,portal:false,mail:false},
    setupReasons:[!config.ownerMailEnabled&&'OWNER_MAIL_NOT_ENABLED',!config.databaseReady&&'MEMBERSHIP_NOT_READY',!config.mailReady&&'MAIL_NOT_READY'].filter(Boolean)};
}
function accessResponse(access) {
  return {ownerAccess:access.ownerAccess===true,adminAccess:access.adminAccess===true,mailAccess:access.mailAccess===true,
    dashboardAccess:access.dashboardAccess===true,canManageAdmins:access.canManageAdmins===true,
    canManageReports:access.canManageReports===true,canManageApps:access.canManageApps===true,
    role:access.role,permissions:access.permissions};
}
function mailResponse(mail,config,access) {
  const ready=mail.ready===true && access.mailAccess===true;
  return {...unavailable(config),...accessResponse(access),ready,mailbox:mail.mailbox || null,
    mailboxes:mail.mailboxes || [],pendingMailboxes:mail.pendingMailboxes || [],mailboxCapacity:mail.mailboxCapacity || 0,
    mailboxUsed:mail.mailboxUsed || 0,mailboxAvailable:mail.mailboxAvailable || 0,capacityAvailable:mail.capacityAvailable===true,
    canCreate:ready && mail.canCreate===true,canSend:ready && mail.canSend===true,canRetryProvisioning:ready && mail.canRetryProvisioning===true,
    canManageMessages:ready && mail.canManageMessages===true,limits:mail.limits,
    capabilities:{checkout:false,portal:false,mail:ready},setupReasons:ready?[]:unavailable(config).setupReasons};
}

async function verifySetupOwner(authorization) {
  const token=/^Bearer ([A-Za-z0-9_.-]{20,8000})$/.exec(authorization || '')?.[1];
  if(!token || !await verifyOwnerToken(token))throw new MembershipError('OWNER_REQUIRED',403);
}
export function createMembershipHandler({env=process.env,getRuntime=getMembershipRuntime,verifyUser=verifyMembershipUser,
  verifyUnconfiguredOwner=verifySetupOwner,rate=consumeMembershipRate,operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS}={}) {
  return boundedMembershipHandler(async request=>{
    try {
      const url=new URL(request.url),action=url.searchParams.get('action') || 'status';
      if(BILLING_ACTIONS.has(action))throw new MembershipError('BILLING_DISABLED',403);
      if(!['GET','POST'].includes(request.method))throw new MembershipError('METHOD_NOT_ALLOWED',405);
      if(!(request.method==='GET'?GET_ACTIONS:POST_ACTIONS).has(action))throw new MembershipError('UNKNOWN_ACTION',404);
      const config=membershipConfig(env);
      if(request.method==='POST')writeOrigin(request,env.NODE_ENV==='production',config);
      if(action==='status' && !request.headers.get('authorization'))return json(unavailable(config));
      if(!config.databaseReady) {
        if(['status','admin-status'].includes(action)) {
          await verifyUnconfiguredOwner(request.headers.get('authorization'));
          return json({...unavailable(config),...(action==='admin-status'?{checks:{database:false,mail:config.mailReady,ownerMail:config.ownerMailEnabled,payments:false,sales:false}}:{})});
        }
        throw new MembershipError('MEMBERSHIP_DATABASE_NOT_CONFIGURED');
      }
      const runtime=await getRuntime(),user=await verifyUser(request.headers.get('authorization'),runtime);
      assertMembershipOperationActive();
      if(typeof runtime.resolveAccess!=='function')throw new MembershipError('ADMIN_ACCESS_UNAVAILABLE');
      const access=await runtime.resolveAccess(user);assertMembershipOperationActive();
      if(!access.mailAccess) {
        if(action==='status')return json(unavailable(config));
        throw new MembershipError('MAIL_ACCESS_REQUIRED',403);
      }
      if(action==='admin-status')return json({...unavailable(config),...accessResponse(access),ready:config.ready,
        checks:{database:config.databaseReady,mail:config.mailReady,ownerMail:config.ownerMailEnabled,payments:false,sales:false}});
      if(!config.ownerMailEnabled || !config.mailReady) {
        if(['status','mailboxes'].includes(action))return json({...unavailable(config),...accessResponse(access)});
        throw new MembershipError(config.ownerMailEnabled?'MAIL_NOT_READY':'OWNER_MAIL_NOT_ENABLED',503);
      }
      if(['status','mailboxes'].includes(action))return json(mailResponse(await runtime.mail.status(user),config,access));
      if(request.method==='GET') {
        const input=Object.fromEntries(url.searchParams);delete input.action;
        if('limit' in input)input.limit=Number(input.limit);
        await rate(runtime.store,user,'mail-read',{limit:120});assertMembershipOperationActive();
        return json(await runtime.mail[{folders:'folders',messages:'list',message:'message',aliases:'listAliases'}[action]](user,input));
      }
      const input=await readMembershipRequest(request);
      await rate(runtime.store,user,action,{limit:action==='mail-connection-check'?3:30});assertMembershipOperationActive();
      if(action==='mail-connection-check')return json(await runtime.mail.checkConnection(user,input));
      if(action==='mailbox-create')return json(await runtime.mail.create(user,input));
      if(action==='alias-create')return json(await runtime.mail.createAlias(user,input));
      if(action==='alias-delete')return json(await runtime.mail.deleteAlias(user,input));
      if(action==='receiving-name-save')return json(await runtime.mail.saveReceivingName(user,input));
      if(action==='receiving-name-hide')return json(await runtime.mail.hideReceivingName(user,input));
      if(action==='send')return json(await runtime.mail.send(user,input));
      if(action==='message-flags') {
        if(input.trash===true && typeof input.read!=='boolean')return json(await runtime.mail.trash(user,input));
        if(typeof input.read==='boolean' && input.trash!==true)return json(await runtime.mail.read(user,input));
        throw new MembershipError('INVALID_MESSAGE_FLAGS',400);
      }
      throw new MembershipError('UNKNOWN_ACTION',404);
    }catch(error){return failure(error);}
  },operationTimeoutMs);
}
// Payment work is cancelled. Even a valid old signing secret or test-mode key
// cannot activate a billing webhook or instantiate the archived billing service.
export function createMembershipWebhook() {
  return async()=>json({error:{code:'BILLING_DISABLED',message:'Payment service is disabled'}},403);
}
