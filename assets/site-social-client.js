/* Public social DTOs and authenticated, account-scoped mutations. */
export const SOCIAL_API = 'https://taithai-app.netlify.app/api/social/';
export const SOCIAL_MEDIA_API = 'https://taithai-app.netlify.app/api/social-media/';
const UPLOAD_CHUNK_BYTES=3145728;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ACTIONS = new Set(['profile','search','posts','follows']);
const TYPES = Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'});
export const SOCIAL_LIMITS = Object.freeze({postText:3000,messageText:4000,imageBytes:10485760,videoBytes:104857600,maxAttachments:4});
export const verifiedSocialUser = user => Boolean(typeof user?.uid === 'string' && user.uid && user.emailVerified === true);
const identity = user => verifiedSocialUser(user) ? user.uid : null;
const error = (code, extra={}) => Object.assign(Error(code),{code,...extra});
function withAbort(work,signal){
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(Object.assign(Error('REQUEST_ABORTED'),{name:'AbortError'}));
    if(signal.aborted){aborted();return;}
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
  });
}
async function pauseUpload(ms,signal){let timer;try{await withAbort(new Promise(resolve=>{timer=setTimeout(resolve,ms);}),signal);}finally{clearTimeout(timer);}}

export function validateSocialFiles(files) {
  const list=Array.from(files || []);
  if(list.length>4)throw error('MEDIA_COUNT');
  const videos=list.filter(file=>String(file.type).startsWith('video/'));
  if(videos.length && list.length!==1)throw error('MEDIA_MIXED');
  for(const file of list){
    if(!TYPES[file.type] || !Number.isSafeInteger(file.size) || file.size<=0)throw error('MEDIA_TYPE');
    if(file.size>(videos.length?SOCIAL_LIMITS.videoBytes:SOCIAL_LIMITS.imageBytes))throw error('MEDIA_SIZE');
  }
  return list;
}
export function socialAttachmentPath(uid,postId,assetId,type) {
  if(typeof uid!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(uid)||![postId,assetId].every(value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))||!TYPES[type])throw error('INVALID_MEDIA');
  return `social-media/${uid}/${postId}/${assetId}.${TYPES[type]}`;
}
export function publicProfileUrl(profile,origin='https://taithai.app') {
  const uid=typeof profile==='string'?profile:profile?.uid;
  return typeof uid==='string'&&uid?`${origin}/profile/?uid=${encodeURIComponent(uid)}`:`${origin}/profile/`;
}
export function safeSocialMediaUrl(value,{avatar=false}={}) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
    if(avatar && /(^|\.)googleusercontent\.com$/.test(url.hostname))return url.href;
    if(url.origin==='https://taithai-app.netlify.app'&&url.pathname==='/api/social-media/'&&!url.hash&&[...url.searchParams.keys()].length===1&&UUID.test(url.searchParams.get('id')||''))return url.href;
  }catch { /* Untrusted URLs are rendered without a remote asset. */ }
  return '';
}

export function createSocialApi({getUser,window:win=globalThis.window,request=win?.fetch?.bind(win)||globalThis.fetch,endpoint=SOCIAL_API}={}) {
  const pending=new Set();
  async function call(action,{method='GET',data,params={}}={}) {
    const user=getUser?.(),uid=identity(user),write=method==='POST';
    if((write||!PUBLIC_ACTIONS.has(action))&&!uid)throw error('AUTH_REQUIRED',{status:401});
    const controller=new AbortController();pending.add(controller);
    const timer=(win?.setTimeout||setTimeout)(()=>controller.abort(),write?55000:25000);
    const same=()=>identity(getUser?.())===uid;
    try {
      const token=uid?await withAbort(user.getIdToken(),controller.signal):null;
      if(!same())throw error('ACCOUNT_CHANGED');
      const query=new URLSearchParams({action,...Object.fromEntries(Object.entries(params).filter(([,value])=>value!==undefined&&value!==null&&value!==''))});
      const result=await request(endpoint+'?'+query,{method,cache:'no-store',credentials:'omit',signal:controller.signal,
        headers:{...(token?{Authorization:'Bearer '+token}:{}),...(write?{'Content-Type':'application/json'}:{})},...(write?{body:JSON.stringify(data||{})}:{})});
      const body=await result.json().catch(()=>({}));
      if(!same())throw error('ACCOUNT_CHANGED');
      if(!result.ok||body.ok===false)throw error(body.error?.code||body.code||'SERVICE_UNAVAILABLE',{status:result.status,deliveryUnknown:write&&result.status>=500});
      const validWrite=!write||({
        'profile-update':()=>typeof body.profile?.uid==='string',
        'post-create':()=>typeof body.post?.id==='string',
        'post-update':()=>typeof body.post?.id==='string',
        'post-delete':()=>body.deleted===true&&typeof body.id==='string',
        'follow-set':()=>typeof body.following==='boolean',
        'message-send':()=>typeof body.message?.id==='string'&&typeof body.threadId==='string',
        'block-set':()=>typeof body.blocked==='boolean'
      }[action]?.()===true);
      if(!validWrite)throw error('INVALID_RESPONSE',{deliveryUnknown:true});
      return body;
    }catch(failure){
      if(failure?.name==='AbortError')throw error(write?'DELIVERY_UNCERTAIN':'REQUEST_TIMEOUT',{deliveryUnknown:write});
      if(write&&!failure.status&&!['ACCOUNT_CHANGED','AUTH_REQUIRED'].includes(failure.code))failure.deliveryUnknown=true;
      throw failure;
    }finally{(win?.clearTimeout||clearTimeout)(timer);pending.delete(controller);}
  }
  return {call,abort(){for(const item of pending)item.abort();pending.clear();}};
}

/** A pending public post or private send stays immutable across retries/reloads. */
export function createSocialOutbox({storage,uid,scope,uuid=()=>globalThis.crypto.randomUUID()}={}) {
  const key=`taithai.social.outbox.v1:${uid}:${scope}`;
  let job=null;
  function save(){try{if(job)storage?.setItem(key,JSON.stringify(job));else storage?.removeItem(key);}catch{/* In-memory idempotency still applies. */}}
  try{
    const restored=JSON.parse(storage?.getItem(key)||'null');
    if(restored?.uid===uid&&typeof restored.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(restored.requestId)&&typeof restored.action==='string'&&restored.data&&typeof restored.data==='object'&&!Array.isArray(restored.data))job=restored;
  }catch{/* Invalid local metadata cannot become a network request. */}
  return {peek:()=>job?structuredClone(job):null,
    begin(action,data,requestId=uuid()){
      if(job)throw error('PENDING_REQUEST');
      job={uid,action,requestId,data:JSON.parse(JSON.stringify(data))};save();return structuredClone(job);
    },
    clear(){job=null;save();},
    remove(){job=null;try{storage?.removeItem(key);}catch{}}
  };
}

async function mediaRequest({getUser,uid,action,params={},data,body,signal,request=globalThis.fetch,endpoint=SOCIAL_MEDIA_API}={}){
  const current=getUser?.();if(!verifiedSocialUser(current))throw error('AUTH_REQUIRED',{status:401});
  if(current.uid!==uid)throw error('ACCOUNT_CHANGED');
  const token=await withAbort(current.getIdToken(),signal);
  if(signal?.aborted)throw error('UPLOAD_CANCELLED');
  if(identity(getUser?.())!==uid)throw error('ACCOUNT_CHANGED');
  const query=new URLSearchParams({action,...params});
  const response=await request(endpoint+'?'+query,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',signal,
    headers:{Authorization:'Bearer '+token,'Content-Type':body!==undefined?'application/octet-stream':'application/json'},body:body!==undefined?body:JSON.stringify(data||{})});
  const value=await response.json().catch(()=>({}));
  if(signal?.aborted)throw error('UPLOAD_CANCELLED');
  if(identity(getUser?.())!==uid)throw error('ACCOUNT_CHANGED');
  if(!response.ok)throw error(value?.error?.code||'MEDIA_UNAVAILABLE',{status:response.status,deliveryUnknown:response.status>=500});
  if(!value||typeof value!=='object'||Array.isArray(value))throw error('INVALID_RESPONSE',{deliveryUnknown:true});
  return value;
}

/** Uploads resume exact acknowledged chunks; a lost acknowledgement is inspected
 * before the same immutable bytes are submitted again. Tokens stay in headers. */
export function uploadSocialFile({file,path,user,getUser=()=>user,onProgress,request=globalThis.fetch,endpoint=SOCIAL_MEDIA_API}={}){
  const controllers=new Set();let cancelled=false;
  const uid=identity(user),metadata={path,type:file?.type,size:file?.size,name:String(file?.name||'attachment').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)};
  const active=()=>{if(cancelled)throw error('UPLOAD_CANCELLED');if(!uid||identity(getUser?.())!==uid)throw error(uid?'ACCOUNT_CHANGED':'AUTH_REQUIRED');};
  async function call(action,options={}){
    active();const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),50000);
    try{
      for(let attempt=0;;attempt++){
        try{return await mediaRequest({getUser,uid,action,request,endpoint,signal:controller.signal,...options});}
        catch(failure){if(failure.code!=='OPERATION_IN_PROGRESS'||attempt>=5)throw failure;await pauseUpload(100*2**attempt,controller.signal);active();}
      }
    }
    catch(failure){if(cancelled)throw error('UPLOAD_CANCELLED');if(identity(getUser?.())!==uid)throw error('ACCOUNT_CHANGED');if(controller.signal.aborted)throw error('REQUEST_TIMEOUT',{deliveryUnknown:true});throw failure;}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  const promise=(async()=>{
    active();validateSocialFiles([file]);
    const parts=typeof path==='string'?path.split('/'):[],asset=parts[3]?.split('.');
    if(parts.length!==4||asset?.length!==2||socialAttachmentPath(uid,parts[2],asset[0],file.type)!==path||typeof file.slice!=='function')throw error('INVALID_MEDIA');
    const total=Math.ceil(file.size/UPLOAD_CHUNK_BYTES),digests=new Map();let uploaded=new Set(),complete=false;
    async function inspect(value){
      const row=value?.upload;
      if(!row||row.path!==path||row.type!==file.type||row.size!==file.size||row.chunkSize!==UPLOAD_CHUNK_BYTES||row.totalChunks!==total||!Array.isArray(row.uploaded)||row.uploaded.some(index=>!Number.isSafeInteger(index)||index<0||index>=total)||typeof row.complete!=='boolean')throw error('INVALID_RESPONSE',{deliveryUnknown:true});
      const acknowledged=new Set(row.uploaded),proofs=row.uploadedDigests;
      if(!proofs||typeof proofs!=='object'||Array.isArray(proofs)||Object.keys(proofs).some(key=>String(Number(key))!==key||!acknowledged.has(Number(key))))throw error('INVALID_RESPONSE',{deliveryUnknown:true});
      // Filename, MIME and byte length are insufficient proof after reselecting
      // a file. Verify every acknowledged chunk before skipping any old bytes.
      for(const index of acknowledged){
        active();const expected=proofs[index];if(typeof expected!=='string'||!/^[0-9a-f]{64}$/i.test(expected))throw error('INVALID_RESPONSE',{deliveryUnknown:true});
        if(!digests.has(index)){
          const bytes=await file.slice(index*UPLOAD_CHUNK_BYTES,Math.min(file.size,(index+1)*UPLOAD_CHUNK_BYTES)).arrayBuffer();active();
          const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);active();
          digests.set(index,Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
        }
        if(digests.get(index)!==expected.toLowerCase())throw error('UPLOAD_FILE_CHANGED',{status:409});
      }
      uploaded=acknowledged;complete=row.complete;
    }
    function progress(){const bytes=[...uploaded].reduce((sum,index)=>sum+Math.min(UPLOAD_CHUNK_BYTES,file.size-index*UPLOAD_CHUNK_BYTES),0);onProgress?.(Math.min(99,Math.floor(bytes/file.size*100)));}
    await inspect(await call('start',{data:metadata}));progress();
    for(let index=0;index<total&&!complete;index++){
      if(uploaded.has(index))continue;
      const bytes=file.slice(index*UPLOAD_CHUNK_BYTES,Math.min(file.size,(index+1)*UPLOAD_CHUNK_BYTES));
      for(let attempt=0;;attempt++){
        try{
          const result=await call('chunk',{params:{path,index:String(index)},body:bytes});
          if(!result?.upload?.uploaded?.includes(index))throw error('INVALID_RESPONSE',{deliveryUnknown:true});
          await inspect(result);progress();break;
        }catch(failure){
          active();if(attempt>=2||failure.status&&failure.status<500)throw failure;
          await inspect(await call('start',{data:metadata}));progress();if(complete||uploaded.has(index))break;
        }
      }
    }
    active();const finished=await call('complete',{data:{path}}),attachment=finished?.attachment;
    if(!attachment||attachment.path!==path||attachment.type!==file.type||attachment.size!==file.size||typeof attachment.name!=='string')throw error('INVALID_RESPONSE',{deliveryUnknown:true});
    onProgress?.(100);return {path,type:attachment.type,size:attachment.size,name:attachment.name};
  })();
  return {promise,cancel(){cancelled=true;for(const controller of controllers)controller.abort();controllers.clear();}};
}

export async function removeSocialUpload(path,{user,getUser=()=>user,request=globalThis.fetch,endpoint=SOCIAL_MEDIA_API}={}){
  const uid=identity(getUser?.());if(!uid)throw error('AUTH_REQUIRED');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    for(let attempt=0;;attempt++){
      try{return await mediaRequest({getUser,uid,action:'abandon',data:{path},request,endpoint,signal:controller.signal});}
      catch(failure){if(failure.code!=='OPERATION_IN_PROGRESS'||attempt>=5)throw failure;await pauseUpload(100*2**attempt,controller.signal);}
    }
  }
  finally{clearTimeout(timer);}
}

/** Fallback only after an explicit play request: bounded range reads validate
 * every returned segment before a local video Blob is assembled. */
export function fetchSocialVideo({url,size,type='video/mp4',onProgress,request=globalThis.fetch}={}){
  const controller=new AbortController();
  const promise=(async()=>{
    if(!safeSocialMediaUrl(url)||!Number.isSafeInteger(size)||size<1||size>SOCIAL_LIMITS.videoBytes||!['video/mp4','video/webm'].includes(type))throw error('INVALID_MEDIA');
    const parts=[];
    for(let offset=0;offset<size;offset+=UPLOAD_CHUNK_BYTES){
      const end=Math.min(size-1,offset+UPLOAD_CHUNK_BYTES-1);
      const result=await request(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Range:`bytes=${offset}-${end}`}});
      const range=result.headers.get('content-range');
      if(result.status!==206||range!==`bytes ${offset}-${end}/${size}`)throw error('INVALID_MEDIA');
      const data=await result.arrayBuffer();if(data.byteLength!==end-offset+1)throw error('INVALID_MEDIA');parts.push(data);onProgress?.(Math.round((end+1)/size*100));
    }
    return new Blob(parts,{type});
  })();
  return {promise,cancel(){controller.abort();}};
}
