import { getSocialRuntime } from './site-social-router.js';
import { SocialBlobError, SOCIAL_BLOB_CHUNK_SIZE } from './site-social-blob-media.js';
import { verifyMembershipUser, consumeMembershipRate, PRIVATE_API_HEADERS } from './site-membership-core.js';
import { readMembershipRequest } from './site-membership-router.js';
import { withMembershipOperationBudget, assertMembershipOperationActive, MEMBERSHIP_OPERATION_TIMEOUT_MS } from './site-operation-budget.js';

const ORIGINS=new Set(['https://taithai.app','https://taithai-app.netlify.app']);
const ACTIONS=new Set(['start','chunk','complete','abandon']);
const json=(value,status=200,origin)=>new Response(JSON.stringify(value),{status,headers:{...PRIVATE_API_HEADERS,...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
function failure(error,origin){const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:'MEDIA_UNAVAILABLE';const status=[400,401,403,404,405,409,413,416,429,502,503].includes(error?.status)?error.status:503;return json({error:{code,message:status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':status===429?'อัปโหลดบ่อยเกินไป กรุณารอสักครู่':status===503?'ระบบไฟล์ยังไม่พร้อม กรุณาลองใหม่':'ไม่สามารถดำเนินการกับไฟล์นี้ได้ กรุณาตรวจสอบข้อมูลและสิทธิ์ของคุณ'}},status,origin);}
const invalid=code=>{throw new SocialBlobError(code);};
export function createSocialMediaHandler({getRuntime=getSocialRuntime,verifyUser=verifyMembershipUser,rate=consumeMembershipRate,env=process.env,operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS,now=()=>Date.now()}={}){
  const publicBuckets=new Map();
  function publicRate(request){const key=(request.headers.get('x-forwarded-for')||'anonymous')+':'+Math.floor(now()/60000),count=(publicBuckets.get(key)||0)+1;publicBuckets.set(key,count);if(publicBuckets.size>5000)publicBuckets.delete(publicBuckets.keys().next().value);if(count>360)throw new SocialBlobError('TOO_MANY_REQUESTS',429);}
  return async request=>{let origin;try{return await withMembershipOperationBudget(async()=>{
    const url=new URL(request.url),action=url.searchParams.get('action'),supplied=request.headers.get('origin');
    if(url.search.length>2500||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))invalid('INVALID_QUERY');
    const publicRead=!action&&url.searchParams.has('id');
    const local=env.NODE_ENV!=='production'&&/^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(supplied||'');
    origin=ORIGINS.has(supplied)||local?supplied:undefined;
    if(request.method==='OPTIONS'){
      const method=request.headers.get('access-control-request-method'),requested=(request.headers.get('access-control-request-headers')||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
      if(publicRead&&['GET','HEAD'].includes(method)&&requested.every(value=>value==='range'))return new Response(null,{status:204,headers:{...PRIVATE_API_HEADERS,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Content-Range, Content-Length, Accept-Ranges','Access-Control-Max-Age':'600'}});
      if(!origin||!['GET','POST'].includes(method)||requested.some(value=>!['authorization','content-type'].includes(value)))throw new SocialBlobError('ORIGIN_NOT_ALLOWED',403);
      return new Response(null,{status:204,headers:{...PRIVATE_API_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    }
    if(publicRead&&['GET','HEAD'].includes(request.method)){publicRate(request);const runtime=await getRuntime();assertMembershipOperationActive();return runtime.media.serve(request);}
    if(supplied&&!origin||request.method==='POST'&&!origin)throw new SocialBlobError('ORIGIN_NOT_ALLOWED',403);
    if(request.method==='GET'&&action==='health'){
      if([...url.searchParams.keys()].some(key=>key!=='action'))invalid('INVALID_QUERY');
    }else if(request.method==='POST'&&ACTIONS.has(action)){
      if([...url.searchParams.keys()].some(key=>!['action',...(action==='chunk'?['path','index']:[])].includes(key)))invalid('INVALID_QUERY');
    }else if(!['GET','POST'].includes(request.method))throw new SocialBlobError('METHOD_NOT_ALLOWED',405);else throw new SocialBlobError('UNKNOWN_ACTION',404);
    const authorization=request.headers.get('authorization');if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(authorization||''))throw new SocialBlobError('AUTH_REQUIRED',401);
    const runtime=await getRuntime(),user=await verifyUser(authorization,runtime);assertMembershipOperationActive();
    await rate(runtime.store,user,'social-media-'+(action==='chunk'?'chunk':'control'),{limit:action==='chunk'?180:60});assertMembershipOperationActive();
    if(action==='health')return json(await runtime.media.health(user),200,origin);
    let result;
    if(action==='chunk'){
      if(!/^application\/octet-stream(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new SocialBlobError('BINARY_REQUIRED');
      const value=url.searchParams.get('index');if(!/^(?:0|[1-9][0-9]?)$/.test(value||''))invalid('INVALID_CHUNK');
      const bytes=await readMembershipRequest(request,{maximum:SOCIAL_BLOB_CHUNK_SIZE,raw:true});assertMembershipOperationActive();
      result=await runtime.media.chunk(user,{path:url.searchParams.get('path'),index:Number(value)},bytes);
    }else{
      const input=await readMembershipRequest(request,{maximum:8192});assertMembershipOperationActive();
      result=await runtime.media[action](user,input);
    }
    return json(result,200,origin);
  },{timeoutMs:operationTimeoutMs,signal:request.signal});}catch(error){return failure(error,origin);}};
}
