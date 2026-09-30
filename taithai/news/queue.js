const activeStates=new Set(['queued','running']);
const error=(code)=>Object.assign(new Error(code),{code});
export const emptyQueue=()=>({version:1,request:null,history:[],workerSeenAt:null});
export function enqueue(q,reason='manual',now=Date.now(),id=crypto.randomUUID()){
 if(!['manual','daily'].includes(reason))throw error('invalid-request');
 if(q.request&&activeStates.has(q.request.state))return {queue:q,request:q.request,created:false};
 const request={id,reason,state:'queued',requestedAt:new Date(now).toISOString()};
 return {queue:{...q,request,history:q.request?[q.request,...q.history].slice(0,30):q.history},request,created:true};
}
export function claim(q,now=Date.now(),token=crypto.randomUUID()){
 const next={...q,workerSeenAt:new Date(now).toISOString()};const r=q.request;
 if(!r||!activeStates.has(r.state))return {queue:next,request:null};
 if(r.state==='running'&&Date.parse(r.leaseUntil)>now)return {queue:next,request:null};
 const request={...r,state:'running',startedAt:r.startedAt||new Date(now).toISOString(),leaseToken:token,leaseUntil:new Date(now+60*60*1000).toISOString(),attempt:(r.attempt||0)+1};
 return {queue:{...next,request},request};
}
export function finish(q,id,token,result,now=Date.now()){
 if(q.request?.id!==id||q.request?.leaseToken!==token||q.request.state!=='running'||Date.parse(q.request.leaseUntil)<=now)throw error('lease-lost');
 if(!['succeeded','failed'].includes(result.state))throw error('invalid-result');
 const {leaseToken,leaseUntil,...previous}=q.request;
 const request={...previous,state:result.state,finishedAt:new Date(now).toISOString()};
 if(result.state==='succeeded'){if(typeof result.editionId!=='string'||!result.editionId)throw error('missing-edition');request.editionId=result.editionId;}
 else request.errorCode=['source-unavailable','publish-failed','worker-failed'].includes(result.errorCode)?result.errorCode:'worker-failed';
 return {...q,request};
}
export function validateQueue(q){
 if(q?.version!==1||!Array.isArray(q.history)||q.history.length>30)throw error('invalid-queue');
 if(q.request&&(!['queued','running','succeeded','failed'].includes(q.request.state)||typeof q.request.id!=='string'))throw error('invalid-queue');return q;
}
export function createQueueClient(config,{fetcher=fetch,now=Date.now}={}){
 if(config?.version!==1||![config.apiKey,config.projectId,config.databaseId,config.uid,config.refreshToken].every(v=>typeof v==='string'&&v.length>0))throw error('queue-not-configured');
 let accessToken,expiresAt=0;
 const endpoint=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/${encodeURIComponent(config.databaseId)}/documents/users/${encodeURIComponent(config.uid)}`;
 async function auth(){
  if(accessToken&&expiresAt>now())return accessToken;
  const r=await fetcher('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:config.refreshToken}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw error('queue-auth-failed');const d=await r.json();if(d.user_id!==config.uid||!d.id_token)throw error('queue-auth-failed');accessToken=d.id_token;expiresAt=now()+(Number(d.expires_in||3600)-60)*1000;return accessToken;
 }
 async function read(){
  const r=await fetcher(endpoint,{headers:{Authorization:'Bearer '+await auth()},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(r.status===404)return {queue:emptyQueue(),updateTime:null};if(!r.ok)throw error('queue-read-failed');const d=await r.json();
  return {queue:d.fields?.newsQueue?.stringValue?validateQueue(JSON.parse(d.fields.newsQueue.stringValue)):emptyQueue(),updateTime:d.updateTime};
 }
 async function mutate(fn){
  for(let attempt=0;attempt<5;attempt++){
   const before=await read();const result=fn(structuredClone(before.queue));const queue=validateQueue(result.queue||result);
   const params=new URLSearchParams({'updateMask.fieldPaths':'newsQueue'});params.set(before.updateTime?'currentDocument.updateTime':'currentDocument.exists',before.updateTime||'false');
   const r=await fetcher(endpoint+'?'+params,{method:'PATCH',headers:{Authorization:'Bearer '+await auth(),'Content-Type':'application/json'},body:JSON.stringify({fields:{newsQueue:{stringValue:JSON.stringify(queue)}}}),signal:AbortSignal.timeout(15000)});
   if(r.ok)return result;if([409,412].includes(r.status))continue;
   if(r.status===400){const d=await r.json();if(d.error?.status==='FAILED_PRECONDITION')continue;}
   throw error('queue-write-failed');
  }throw error('queue-busy');
 }
 return {read,mutate,enqueue:()=>mutate(q=>enqueue(q)),claim:()=>mutate(q=>claim(q)),finish:(id,token,result)=>mutate(q=>finish(q,id,token,result))};
}
