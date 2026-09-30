import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createQueueClient,enqueue} from '../taithai/news/queue.js';
const [action,credentialsPath,leasePath,argument]=process.argv.slice(2);
if(!action||!credentialsPath||!leasePath)throw new Error('Usage: news-queue-worker.mjs <status|claim|complete|fail> <private-credentials> <private-lease> [edition-id|error-code]');
let config;try{config=JSON.parse(await readFile(credentialsPath,'utf8'));}catch(e){if(e.code==='ENOENT'){console.log(JSON.stringify({configured:false}));process.exit(0);}throw e;}
const client=createQueueClient(config);
try{
 if(action==='status'){const {queue}=await client.read();const r=queue.request;console.log(JSON.stringify({configured:true,state:r?.state||'idle',id:r?.id,workerSeenAt:queue.workerSeenAt}));}
 else if(action==='claim'){
  const result=await client.claim();if(!result.request){console.log(JSON.stringify({claimed:false}));process.exit(0);}
  await mkdir(path.dirname(path.resolve(leasePath)),{recursive:true,mode:0o700});await writeFile(leasePath,JSON.stringify(result.request),{mode:0o600});
  console.log(JSON.stringify({claimed:true,id:result.request.id,reason:result.request.reason,requestedAt:result.request.requestedAt,leaseUntil:result.request.leaseUntil}));
 }else if(action==='complete'||action==='fail'){
  const lease=JSON.parse(await readFile(leasePath,'utf8'));
  await client.finish(lease.id,lease.leaseToken,action==='complete'?{state:'succeeded',editionId:argument}:{state:'failed',errorCode:argument});
  await unlink(leasePath);console.log(JSON.stringify({state:action==='complete'?'succeeded':'failed'}));
 }else throw new Error('unknown-action');
}catch(e){console.log(JSON.stringify({error:e.code||'queue-unavailable'}));process.exitCode=1;}
