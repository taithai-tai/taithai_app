import assert from 'node:assert/strict';
import {emptyQueue,enqueue,claim,finish,createQueueClient} from '../taithai/news/queue.js';
const at=Date.parse('2026-09-29T00:00:00Z');
let q=enqueue(emptyQueue(),'manual',at,'request1').queue;
assert.equal(enqueue(q,'manual',at+1,'request2').created,false);
let c=claim(q,at+100,'lease1');q=c.queue;
assert.equal(claim(q,at+200,'lease2').request,null);
assert.throws(()=>finish(q,'request1','wrong',{state:'succeeded',editionId:'edition1'},at+1000));
assert.throws(()=>finish(q,'request1','lease1',{state:'succeeded',editionId:'edition1'},at+3601000));
q=finish(q,'request1','lease1',{state:'succeeded',editionId:'edition1'},at+1000);
assert.equal(q.request.editionId,'edition1');
assert.equal(enqueue(q,'manual',at+2000,'request2').queue.history[0].id,'request1');
assert.equal(claim(emptyQueue(),at).request,null);
let revision=0,stored=emptyQueue(),conflict=true;
const fetcher=async(url,options)=>{
 if(url.startsWith('https://securetoken.'))return Response.json({user_id:'queue-user',id_token:'test-only-token',expires_in:'3600'});
 assert.equal(options.headers.Authorization,'Bearer test-only-token');
 if(!options.method)return Response.json({updateTime:String(revision),fields:{newsQueue:{stringValue:JSON.stringify(stored)}}});
 if(conflict){conflict=false;revision++;stored=enqueue(stored,'manual',at,'competing-request').queue;return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400});}
 assert.equal(new URL(url).searchParams.get('currentDocument.updateTime'),String(revision));
 stored=JSON.parse(JSON.parse(options.body).fields.newsQueue.stringValue);revision++;return Response.json({});
};
const client=createQueueClient({version:1,apiKey:'test',projectId:'test',databaseId:'test',uid:'queue-user',refreshToken:'test-only'},{fetcher,now:()=>at});
const r=await client.enqueue();assert.equal(r.request.id,'competing-request');assert.equal(r.created,false);
assert.throws(()=>createQueueClient({}));console.log('PASS: duplicate requests, atomic retry, lease fencing, recovery bounds, completion and credential validation');
