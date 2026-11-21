import { membershipConfig, MEMBERSHIP_PLAN, PRIVATE_API_HEADERS, MembershipError, verifyMembershipUser, isMembershipOwner, ownerMailTrialAllowed, consumeMembershipRate } from './site-membership-core.js';
import { getMembershipRuntime, assertMembershipMailRouting } from './site-membership-runtime.js';
import { verifyOwnerToken } from './site-app-gate.js';
import { withMembershipOperationBudget, assertMembershipOperationActive, MEMBERSHIP_OPERATION_TIMEOUT_MS } from './site-operation-budget.js';

const GET_ACTIONS=new Set(['status','mailboxes','folders','messages','message','admin-discounts','admin-status']);
const POST_ACTIONS=new Set(['checkout','quantity-update','portal','mailbox-create','send','message-flags','admin-discount-create','admin-discount-disable']);
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
function writeOrigin(request,production,config,action) {
  const origin=request.headers.get('origin');
  if(origin==='https://taithai.app')return;
  if(!production && origin && /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(origin) && origin===new URL(request.url).origin)return;
  if(config.ownerTrialOrigin && origin===config.ownerTrialOrigin && origin===new URL(request.url).origin && ['mailbox-create','send','message-flags'].includes(action))return true;
  throw new MembershipError('ORIGIN_NOT_ALLOWED',403);
}
function unavailable(config){
  return {ready:false,testMode:config.testMode,plan:MEMBERSHIP_PLAN,membership:null,quantity:0,unitAmount:9900,totalAmount:0,mailboxLimit:0,quantityUpdateAvailable:false,mailboxes:[],pendingMailboxes:[],mailboxCapacity:0,mailboxUsed:0,ownerTrial:false,mailReady:config.mailReady,capabilities:{checkout:false,portal:false,mail:false},canCreate:false,canSend:false,canManageMessages:false,setupReasons:[!config.stripeConfigured&&'PAYMENTS_NOT_READY',!config.databaseReady&&'MEMBERSHIP_NOT_READY',!config.mailReady&&'MAIL_NOT_READY',config.liveMode&&!config.salesEnabled&&'SALES_NOT_OPEN'].filter(Boolean)};
}
async function verifySetupOwner(authorization) {
  const token=/^Bearer ([A-Za-z0-9_.-]{20,8000})$/.exec(authorization || '')?.[1];
  if(!token || !await verifyOwnerToken(token))throw new MembershipError('OWNER_REQUIRED',403);
}
export function createMembershipHandler({env=process.env,getRuntime=getMembershipRuntime,verifyUser=verifyMembershipUser,verifyUnconfiguredOwner=verifySetupOwner,rate=consumeMembershipRate,checkMailRouting=assertMembershipMailRouting,operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS}={}) {
  return boundedMembershipHandler(async request=>{
    try {
      const url=new URL(request.url),action=url.searchParams.get('action') || 'status';
      if(!['GET','POST'].includes(request.method))throw new MembershipError('METHOD_NOT_ALLOWED',405);
      if(!(request.method==='GET'?GET_ACTIONS:POST_ACTIONS).has(action))throw new MembershipError('UNKNOWN_ACTION',404);
      const config=membershipConfig(env);
      const trialOrigin=request.method==='POST' && writeOrigin(request,env.NODE_ENV==='production',config,action)===true;
      if(action==='status' && (!request.headers.get('authorization') || !config.databaseReady))return json(unavailable(config));
      if(!config.databaseReady && ['admin-status','admin-discounts'].includes(action)) {
        await verifyUnconfiguredOwner(request.headers.get('authorization'));
        return json({ready:false,testMode:config.testMode,plan:MEMBERSHIP_PLAN,discounts:[],checks:{database:false,payments:config.stripeConfigured,mail:config.mailReady,sales:config.salesEnabled,ownerTrial:false}});
      }
      if(!config.databaseReady)throw new MembershipError('MEMBERSHIP_DATABASE_NOT_CONFIGURED');
      const runtime=await getRuntime(),user=await verifyUser(request.headers.get('authorization'),runtime);
      assertMembershipOperationActive();
      if(trialOrigin && !ownerMailTrialAllowed(user,config))throw new MembershipError('OWNER_TRIAL_REQUIRED',403);
      const admin=action.startsWith('admin-');
      if(admin && !isMembershipOwner(user))throw new MembershipError('OWNER_REQUIRED',403);
      if(action==='status') {
        const [bill,mail]=await Promise.all([runtime.billing.getStatus(user),runtime.mail.status(user)]);
        return json({...unavailable(config),...bill,ready:Boolean(bill.ready && (config.mailReady || config.testMode) && (config.testMode || config.salesEnabled)),testMode:config.testMode,
          ownerTrial:mail.ownerTrial===true,mailReady:mail.ready===true,mailProvider:config.mailProvider,
          quantityUpdateAvailable:bill.quantityUpdateAvailable===true && (config.testMode || config.salesEnabled && config.mailReady),
          mailbox:mail.mailbox || null,mailboxes:mail.mailboxes || [],pendingMailboxes:mail.pendingMailboxes || [],mailboxCapacity:mail.mailboxCapacity ?? (mail.canCreate?1:mail.mailboxes?.length || 0),mailboxUsed:mail.mailboxUsed ?? mail.mailboxes?.length ?? 0,canRetryProvisioning:mail.canRetryProvisioning===true,
          canCreate:mail.canCreate===true,canSend:mail.canSend===true,canManageMessages:mail.canManageMessages===true,limits:mail.limits,
          capabilities:{checkout:bill.checkoutAvailable===true && (config.testMode || config.salesEnabled),portal:bill.portalAvailable===true,mail:mail.ready===true && (Boolean(mail.mailboxes?.length) || mail.mailbox?.status==='provisioning' || mail.canCreate===true)},
          setupReasons:[!config.stripeConfigured&&'PAYMENTS_NOT_READY',!config.mailReady&&'MAIL_NOT_READY',config.liveMode&&!config.salesEnabled&&'SALES_NOT_OPEN'].filter(Boolean)});
      }
      if(action==='admin-status')return json({ready:config.ready,testMode:config.testMode,plan:MEMBERSHIP_PLAN,checks:{database:config.databaseReady,payments:config.stripeConfigured,mail:config.mailReady,sales:config.salesEnabled,ownerTrial:ownerMailTrialAllowed(user,config)}});
      if(action==='admin-discounts')return json({...await runtime.billing.adminList(user,{cursor:url.searchParams.get('cursor') || undefined}),testMode:config.testMode});
      if(action==='mailboxes')return json(await runtime.mail.status(user));
      if(request.method==='GET') {
        const input=Object.fromEntries(url.searchParams);delete input.action;
        if('limit' in input)input.limit=Number(input.limit);
        await rate(runtime.store,user,'mail-read',{limit:120});
        assertMembershipOperationActive();
        return json(await runtime.mail[{folders:'folders',messages:'list',message:'message'}[action]](user,input));
      }
      const input=await readMembershipRequest(request);
      await rate(runtime.store,user,action,{limit:action==='send'?30:['checkout','quantity-update'].includes(action)?5:30,windowMs:['checkout','quantity-update'].includes(action)?3600000:60000});
      assertMembershipOperationActive();
      switch(action) {
        case 'checkout':
        case 'quantity-update':
          if(config.liveMode) {
            if(!config.salesEnabled)throw new MembershipError('SALES_NOT_OPEN',503);
            await checkMailRouting({config,provider:runtime.provider});
            assertMembershipOperationActive();
          }
          if(action==='quantity-update')return json(await runtime.billing.updateQuantity(user,input));
          if(input.discountCode!==undefined){input.promotionCode=input.discountCode;delete input.discountCode;}
          return json(await runtime.billing.checkout(user,input));
        case 'portal':return json(await runtime.billing.portal(user));
        case 'mailbox-create':return json(await runtime.mail.create(user,input));
        case 'send':return json(await runtime.mail.send(user,input));
        case 'message-flags':
          if(input.trash===true && typeof input.read!=='boolean')return json(await runtime.mail.trash(user,input));
          if(typeof input.read==='boolean' && input.trash!==true)return json(await runtime.mail.read(user,input));
          throw new MembershipError('INVALID_MESSAGE_FLAGS',400);
        case 'admin-discount-create':return json(await runtime.billing.adminCreate(user,input));
        case 'admin-discount-disable':return json(await runtime.billing.adminDisable(user,input));
        default:throw new MembershipError('UNKNOWN_ACTION',404);
      }
    } catch(error){return failure(error);}
  },operationTimeoutMs);
}
export function createMembershipWebhook({getRuntime=getMembershipRuntime,operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS}={}) {
  return boundedMembershipHandler(async request=>{
    try {
      if(request.method!=='POST')throw new MembershipError('METHOD_NOT_ALLOWED',405);
      const signature=request.headers.get('stripe-signature');if(!signature)throw new MembershipError('WEBHOOK_SIGNATURE_REQUIRED',400);
      const rawBody=await readMembershipRequest(request,{maximum:2097152,raw:true});
      const runtime=await getRuntime();
      assertMembershipOperationActive();
      return json(await runtime.billing.webhook({rawBody,signature}));
    } catch(error){return failure(error);}
  },operationTimeoutMs);
}
