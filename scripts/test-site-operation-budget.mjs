import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../server-lib/site-billing.js';
import { withMembershipOperationBudget, membershipOperationSignal, assertMembershipOperationActive,
  combineMembershipOperationSignal, createMembershipFetch, MEMBERSHIP_REMOTE_TIMEOUT_MS } from '../server-lib/site-operation-budget.js';

const timedOut=error=>error?.code==='OPERATION_TIMEOUT' && error.status===503;
function mockResponse(value) { return Response.json(value,{headers:{'request-id':'req_budget_test'}}); }
function sdk(fetchImpl,{timeout=MEMBERSHIP_REMOTE_TIMEOUT_MS,fetchTimeout=MEMBERSHIP_REMOTE_TIMEOUT_MS}={}) {
  return new Stripe('sk_test_operation_budget_fixture',{apiVersion:STRIPE_API_VERSION,timeout,maxNetworkRetries:0,
    httpClient:Stripe.createFetchHttpClient(createMembershipFetch(fetchImpl,{timeoutMs:fetchTimeout}))});
}
function pendingFetch(calls,{milliseconds=30000,value={id:'price_fixture',object:'price'},onStart=()=>{}}={}) {
  return (url,init)=>new Promise((resolve,reject)=>{
    const call={url:String(url),method:init.method,signal:init.signal,headers:new Headers(init.headers),aborted:false};calls.push(call);
    let timer;
    const abort=()=>{call.aborted=true;clearTimeout(timer);reject(init.signal.reason);};
    if(init.signal.aborted){abort();return;}
    init.signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{init.signal.removeEventListener('abort',abort);resolve(mockResponse(value));},milliseconds);
    onStart();
  });
}

test('operation context propagates across awaits and closes after successful completion',async()=>{
  assert.equal(membershipOperationSignal(),undefined);assert.equal(assertMembershipOperationActive(),Infinity);
  let signal;
  const value=await withMembershipOperationBudget(async()=>{
    signal=membershipOperationSignal();assert.equal(signal.aborted,false);await delay(2);
    assert.equal(membershipOperationSignal(),signal);assert.ok(assertMembershipOperationActive()>0);return 'confirmed';
  });
  assert.equal(value,'confirmed');assert.equal(signal.aborted,true);assert.equal(membershipOperationSignal(),undefined);
  assert.equal(combineMembershipOperationSignal(),undefined);
});
test('budgets reject invalid durations and preserve actual service errors',async()=>{
  for(const timeoutMs of [0,-1,1.5,45001,Infinity])await assert.rejects(withMembershipOperationBudget(()=>{}, {timeoutMs}),/INVALID_OPERATION_BUDGET/);
  assert.throws(()=>createMembershipFetch(fetch,{timeoutMs:8001}),/INVALID_REMOTE_BUDGET/);
  const expected=Object.assign(Error('existing_service_error'),{code:'OWN_SERVICE_ERROR',status:409});
  await assert.rejects(withMembershipOperationBudget(()=>{throw expected;}),error=>error===expected);
});
test('deadline settles stalled work and cancellation blocks a late external POST before transport invocation',async()=>{
  await assert.rejects(withMembershipOperationBudget(()=>new Promise(()=>{}),{timeoutMs:10}),timedOut);
  let release,lateError,finished,started;const caller=new AbortController();
  const gate=new Promise(resolve=>{release=resolve;}),done=new Promise(resolve=>{finished=resolve;}),began=new Promise(resolve=>{started=resolve;});let calls=0;
  const request=createMembershipFetch(async()=>{calls++;return mockResponse({});});
  const operation=withMembershipOperationBudget(async()=>{
    started();
    await gate;
    try {await request('https://api.stripe.com/v1/customers',{method:'POST',body:'metadata[test]=1'});}
    catch(error){lateError=error;}
    finally{finished();}
  },{signal:caller.signal});
  const checked=assert.rejects(operation,timedOut);await began;caller.abort();await checked;
  release();await done;assert.equal(calls,0);assert.ok(timedOut(lateError));
});
test('completed request contexts cannot start detached financial work',async()=>{
  let release,late;const gate=new Promise(resolve=>{release=resolve;});let calls=0;
  const request=createMembershipFetch(async()=>{calls++;return mockResponse({});});
  await withMembershipOperationBudget(()=>{late=gate.then(()=>request('https://api.stripe.com/v1/checkout/sessions',{method:'POST'}));return 'done';});
  const checked=assert.rejects(late,timedOut);release();await checked;assert.equal(calls,0);
});
test('nested deadlines cannot extend their parent and concurrent requests have isolated signals',async()=>{
  let first,second,started;const caller=new AbortController(),began=new Promise(resolve=>{started=resolve;});
  const parent=withMembershipOperationBudget(async()=>{
    first=membershipOperationSignal();const remaining=assertMembershipOperationActive();
    return withMembershipOperationBudget(async()=>{
      assert.ok(assertMembershipOperationActive()<=remaining);started();await new Promise(()=>{});
    });
  },{timeoutMs:30000,signal:caller.signal});
  const checked=Promise.allSettled([
    parent,
    withMembershipOperationBudget(async()=>{second=membershipOperationSignal();await delay(2);assert.equal(second.aborted,false);return 'other';}),
  ]);
  await began;caller.abort();
  const results=await checked;
  assert.equal(results[0].status,'rejected');assert.ok(timedOut(results[0].reason));assert.deepEqual(results[1],{status:'fulfilled',value:'other'});assert.notEqual(first,second);
});
test('pre-aborted requests never invoke work; caller cancellation aborts the active transport',async()=>{
  const before=new AbortController();before.abort();let entered=0;
  await assert.rejects(withMembershipOperationBudget(()=>{entered++;},{signal:before.signal}),timedOut);assert.equal(entered,0);
  let started;const began=new Promise(resolve=>{started=resolve;}),caller=new AbortController(),calls=[];
  const request=createMembershipFetch(pendingFetch(calls,{onStart:started}));
  const operation=withMembershipOperationBudget(()=>request('https://api.stripe.com/v1/prices/price_fixture',{method:'GET'}),{signal:caller.signal});
  const checked=assert.rejects(operation,timedOut);await began;caller.abort();await checked;assert.equal(calls.length,1);assert.equal(calls[0].aborted,true);
});
test('official Stripe FetchHttpClient aborts the aggregate chain and preserves the mutation idempotency key',async()=>{
  let started;const began=new Promise(resolve=>{started=resolve;}),caller=new AbortController();
  const calls=[];const pending=pendingFetch(calls,{onStart:started});
  const stripe=sdk(async(url,init)=>{
    if(String(url).includes('/prices/')){calls.push({url:String(url),method:init.method});return mockResponse({id:'price_fixture',object:'price'});}
    return pending(url,init);
  });
  let sdkEnded;
  const stopped=new Promise(resolve=>{sdkEnded=resolve;});
  const operation=withMembershipOperationBudget(async()=>{
    try {
      await stripe.prices.retrieve('price_fixture');
      await stripe.customers.create({metadata:{fixture:'budget'}},{idempotencyKey:'tt-stable-budget-request'});
      await stripe.checkout.sessions.create({mode:'subscription',customer:'cus_fixture'});
    } finally {sdkEnded();}
  },{signal:caller.signal});
  const checked=assert.rejects(operation,timedOut);await began;caller.abort();await checked;
  await stopped;assert.equal(calls.length,2);assert.equal(calls[1].method,'POST');assert.equal(calls[1].aborted,true);
  assert.equal(calls[1].headers.get('idempotency-key'),'tt-stable-budget-request');
});
test('official Stripe SDK does not retry a failed transport when network retries are zero',async()=>{
  let calls=0;const stripe=sdk(async()=>{calls++;throw Error('network_fixture_failure');});
  await assert.rejects(withMembershipOperationBudget(()=>stripe.prices.retrieve('price_fixture')),error=>error.type==='StripeConnectionError');
  assert.equal(calls,1);
});
test('per-call transport timeout aborts before the longer overall operation deadline',async()=>{
  const calls=[],stripe=sdk(pendingFetch(calls),{timeout:500,fetchTimeout:15});
  await withMembershipOperationBudget(async()=>{
    await assert.rejects(stripe.prices.retrieve('price_fixture'),error=>error.type==='StripeConnectionError');
    assert.ok(assertMembershipOperationActive()>0);
  });
  assert.equal(calls.length,1);assert.equal(calls[0].aborted,true);
});
test('operation signal remains armed during Stripe response-body consumption after headers',async()=>{
  let bodyAborted=false,calls=0,started;const began=new Promise(resolve=>{started=resolve;}),caller=new AbortController();
  const stripe=sdk(async(url,init)=>{
    calls++;
    return new Response(new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode('{"id":"price_fixture",'));
      init.signal.addEventListener('abort',()=>{bodyAborted=true;controller.error(init.signal.reason);},{once:true});
    },pull(){started();}}),{headers:{'content-type':'application/json'}});
  });
  const checked=assert.rejects(withMembershipOperationBudget(()=>stripe.prices.retrieve('price_fixture'),{signal:caller.signal}),timedOut);
  await began;caller.abort();await checked;assert.equal(bodyAborted,true);assert.equal(calls,1);
});
test('wall-clock deadline checks stop a POST even before a delayed timer callback can run',async()=>{
  let calls=0;const request=createMembershipFetch(async()=>{calls++;return mockResponse({});});
  await assert.rejects(withMembershipOperationBudget(async()=>{
    const until=performance.now()+8;while(performance.now()<until){}
    return request('https://api.stripe.com/v1/customers',{method:'POST'});
  },{timeoutMs:3}),timedOut);
  assert.equal(calls,0);
});
