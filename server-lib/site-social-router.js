import { getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createSocialService, SocialError } from './site-social-service.js';
import { createSocialStore } from './site-social-store.js';
import { createSocialBlobMedia } from './site-social-blob-media.js';
import { initializeMembershipDatabase, verifyMembershipUser, consumeMembershipRate, PRIVATE_API_HEADERS, MEMBERSHIP_DATABASE } from './site-membership-core.js';
import { readMembershipRequest } from './site-membership-router.js';
import { withMembershipOperationBudget, assertMembershipOperationActive, MEMBERSHIP_OPERATION_TIMEOUT_MS } from './site-operation-budget.js';

const ORIGINS=new Set(['https://taithai.app','https://taithai-app.netlify.app']);
const PUBLIC_GET=new Set(['profile','search','posts','follows']);
const GET=new Set([...PUBLIC_GET,'me','threads','messages','blocks']);
const POST=new Set(['profile-update','post-create','post-update','post-delete','follow-set','message-send','block-set']);
const METHODS=Object.freeze({'me':'getMe','profile':'getProfile','search':'searchProfiles','posts':'listPosts','follows':'listFollows','threads':'listThreads','messages':'listMessages','blocks':'listBlocks',
  'profile-update':'updateProfile','post-create':'createPost','post-update':'updatePost','post-delete':'deletePost','follow-set':'setFollow','message-send':'sendMessage','block-set':'setBlock'});
let runtime;
export function getSocialRuntime() {
  if(runtime)return runtime;
  const {auth}=initializeMembershipDatabase(),store=createSocialStore(getFirestore(getApp('taithai-membership'),MEMBERSHIP_DATABASE));
  const media=createSocialBlobMedia({store}),social=createSocialService({store,auth,media});
  return runtime={store,auth,social,media};
}
const json=(data,status=200,origin)=>new Response(JSON.stringify(data),{status,headers:{...PRIVATE_API_HEADERS,
  ...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
function failure(error,origin) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:'SERVICE_UNAVAILABLE';
  const status=[400,401,403,404,405,409,413,429,502,503].includes(error?.status)?error.status:503;
  return json({error:{code,message:status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':status===429?'ทำรายการบ่อยเกินไป กรุณารอสักครู่':status===503?'บริการยังไม่พร้อม กรุณาลองใหม่':'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและสิทธิ์ของคุณ'}},status,origin);
}
export function createSocialHandler({getRuntime=getSocialRuntime,verifyUser=verifyMembershipUser,rate=consumeMembershipRate,env=process.env,
  operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS,now=()=>Date.now()}={}) {
  // Anonymous public reads need no database writes or persistent IP collection.
  const guestBuckets=new Map();
  function guestRate(request) {
    const bucket=Math.floor(now()/60000),key=(request.headers.get('x-forwarded-for')||'anonymous')+':'+bucket;
    const count=(guestBuckets.get(key)||0)+1;guestBuckets.set(key,count);
    if(guestBuckets.size>5000)guestBuckets.delete(guestBuckets.keys().next().value);
    if(count>180)throw new SocialError('TOO_MANY_REQUESTS',429);
  }
  return async request=>{
    let origin;
    try{return await withMembershipOperationBudget(async()=>{
      const supplied=request.headers.get('origin');
      const local=env.NODE_ENV!=='production'&&/^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(supplied||'');
      origin=ORIGINS.has(supplied)||local?supplied:undefined;
      if(supplied&&!origin || request.method==='POST'&&!origin)throw new SocialError('ORIGIN_NOT_ALLOWED',403);
      if(request.method==='OPTIONS'){
        if(!origin||!['GET','POST'].includes(request.headers.get('access-control-request-method')))throw new SocialError('ORIGIN_NOT_ALLOWED',403);
        if((request.headers.get('access-control-request-headers')||'').split(',').some(value=>value.trim()&&!['authorization','content-type'].includes(value.trim().toLowerCase())))throw new SocialError('ORIGIN_NOT_ALLOWED',403);
        return new Response(null,{status:204,headers:{...PRIVATE_API_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
      }
      if(!['GET','POST'].includes(request.method))throw new SocialError('METHOD_NOT_ALLOWED',405);
      const url=new URL(request.url),action=url.searchParams.get('action')||'posts';
      if(!(request.method==='GET'?GET:POST).has(action))throw new SocialError('UNKNOWN_ACTION',404);
      if(url.search.length>2500||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))throw new SocialError('INVALID_QUERY');
      const authorization=request.headers.get('authorization'),required=request.method==='POST'||!PUBLIC_GET.has(action);
      if(required&&!authorization)throw new SocialError('AUTH_REQUIRED',401);
      if(authorization&&!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(authorization))throw new SocialError('AUTH_REQUIRED',401);
      if(!authorization)guestRate(request);
      const runtime=await getRuntime();assertMembershipOperationActive();
      let user=null;
      if(authorization){
        user={...await verifyUser(authorization,runtime)};
        await rate(runtime.store,user,'social-'+(request.method==='GET'?'read':'write'),{limit:request.method==='GET'?180:60});
        if(request.method==='POST')await rate(runtime.store,user,'social-'+action,{limit:action==='post-create'?10:action==='profile-update'?10:30});
      }
      assertMembershipOperationActive();
      let input;
      if(request.method==='GET'){
        input=Object.fromEntries(url.searchParams);delete input.action;
        if('limit'in input)input.limit=Number(input.limit);
        if(action==='me'&&Object.keys(input).length)throw new SocialError('INVALID_QUERY');
      }else{
        if([...url.searchParams.keys()].some(key=>key!=='action'))throw new SocialError('INVALID_QUERY');
        input=await readMembershipRequest(request,{maximum:32768});
      }
      assertMembershipOperationActive();
      const result=await runtime.social[METHODS[action]](user,input);
      return json(result,200,origin);
    },{timeoutMs:operationTimeoutMs,signal:request.signal});}catch(error){return failure(error,origin);}
  };
}
