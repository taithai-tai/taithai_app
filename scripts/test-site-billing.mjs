import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createBillingService, BILLING_PLAN, STRIPE_API_VERSION } from '../server-lib/site-billing.js';
import { withMembershipOperationBudget } from '../server-lib/site-operation-budget.js';
import { createMembershipStore } from '../server-lib/site-membership-core.js';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const owner = {uid:'owner',email:'taithai5002@gmail.com',emailVerified:true};
const user = {uid:'member_1',email:'member@example.com',emailVerified:true};
const secret = 'whsec_test_fixture_never_live';
const sdk = new Stripe('sk_test_fixture_never_live',{apiVersion:STRIPE_API_VERSION});

function memory() {
  const docs = new Map(), locks = new Map();
  const store = {
    docs,
    async get(path) { return copy(docs.get(path) || null); },
    async set(path,data,{merge=false}={}) { docs.set(path,copy(merge?{...docs.get(path),...data}:data)); },
    async create(path,data) { if (docs.has(path)) throw new Error('ALREADY_EXISTS'); docs.set(path,copy(data)); },
    async delete(path) { docs.delete(path); },
    async transaction(fn) { return store.withLock('memory-transaction',()=>fn({get:store.get,set:store.set,create:store.create,delete:store.delete})); },
    async list(collection,{where=[],limit=100,orderBy,startAfter}={}) {
      let result=[...docs].filter(([key]) => key.startsWith(collection+'/') && key.split('/').length===2)
        .map(([key,value]) => ({id:key.split('/')[1],...copy(value)}))
        .filter(value => where.every(([field,operator,wanted]) => operator==='==' && value[field]===wanted));
      const orders=orderBy?(Array.isArray(orderBy[0])?orderBy:[orderBy]):[];
      const compare=(a,b)=>{for(let index=0;index<orders.length;index++){const [field,direction]=orders[index],left=String(field==='__name__'?a.id:a[field]),right=String(b[index]);
        if(left!==right)return (left<right?-1:1)*(direction==='desc'?-1:1);}return 0;};
      if (orders.length) result.sort((a,b)=>compare(a,orders.map(([field])=>field==='__name__'?b.id:b[field])));
      if (startAfter) result=result.filter(row=>compare(row,startAfter)>0);
      return result.slice(0,limit);
    },
    async withLock(key,fn) {
      const prior=locks.get(key) || Promise.resolve(); let release;
      const pending=new Promise(resolve => {release=resolve;}); locks.set(key,pending);
      await prior;
      try { return await fn(); } finally { release(); if (locks.get(key)===pending) locks.delete(key); }
    },
  };
  return store;
}
function fixture(overrides={}) {
  let time=Date.UTC(2026,10,21,12), customerCount=0, sessionCount=0, promoCount=0, couponCount=0, subscriptionReads=0;
  const store=memory(), sessions=new Map(), promotions=new Map(), coupons=new Map(), subscriptions=new Map(), requests=new Map(), calls=[];
  const charges=new Map(),invoices=new Map(),payments=new Map(),disputes=new Map(),warnings=new Map(),portalConfigurations=new Map();
  const price={id:'price_mail99',active:true,livemode:false,type:'recurring',currency:'thb',unit_amount:9900,billing_scheme:'per_unit',transform_quantity:null,
    recurring:{interval:'month',interval_count:1,usage_type:'licensed'},product:'prod_mail'};
  portalConfigurations.set('bpc_manage',{id:'bpc_manage',active:true,livemode:false,features:{subscription_update:{enabled:false}}});
  portalConfigurations.set('bpc_quantity',{id:'bpc_quantity',active:true,livemode:false,is_default:false,features:{subscription_update:{enabled:true,
    default_allowed_updates:['quantity'],proration_behavior:'always_invoice',billing_cycle_anchor:'unchanged',schedule_at_period_end:{conditions:[]},
    products:[{product:price.product,prices:[price.id],adjustable_quantity:{enabled:true,minimum:1,maximum:null}}]}}});
  const stripe={
    webhooks:sdk.webhooks,
    prices:{async retrieve() { calls.push('price'); return copy(price); }},
    customers:{async create(data,options) {calls.push(['customer',copy(data)]);if (!requests.has(options.idempotencyKey)) requests.set(options.idempotencyKey,{id:`cus_${++customerCount}`});return copy(requests.get(options.idempotencyKey));}},
    checkout:{sessions:{
      async create(data,options) {
        calls.push(['checkout',copy(data),copy(options)]);
        if (!requests.has(options.idempotencyKey)) {
          const id=`cs_test_${++sessionCount}`;
          const session={id,url:`https://checkout.stripe.com/c/pay/${id}`,status:'open',expires_at:data.expires_at,customer:data.customer,livemode:price.livemode};
          requests.set(options.idempotencyKey,session); sessions.set(id,session);
        }
        return copy(requests.get(options.idempotencyKey));
      },
      async retrieve(id) { return copy(sessions.get(id)); },
    }},
    billingPortal:{sessions:{async create(data,options) {calls.push(['portal',copy(data),copy(options)]);return {id:'bps_test',url:'https://billing.stripe.com/p/session/test',
      customer:data.customer,configuration:data.configuration,flow:copy(data.flow_data || null),livemode:price.livemode};}},
      configurations:{async retrieve(id){return copy(portalConfigurations.get(id));}}},
    coupons:{
      async create(data) {couponCount++;calls.push(['coupon',copy(data)]);const result={...copy(data),livemode:price.livemode};coupons.set(data.id,result);return copy(result);},
      async retrieve(id) {if(!coupons.has(id)) throw Object.assign(new Error(),{code:'resource_missing'});return copy(coupons.get(id));},
    },
    promotionCodes:{
      async create(data) {calls.push(['promotion',copy(data)]);const result={...copy(data),id:`promo_${++promoCount}`,livemode:price.livemode,times_redeemed:0};promotions.set(result.id,result);return copy(result);},
      async retrieve(id) {return copy(promotions.get(id));},
      async list({code}) {calls.push(['promotionList',code]);return {data:[...promotions.values()].filter(p => p.code===code).map(copy)};},
      async update(id,data) {calls.push(['promotionUpdate',id,copy(data)]);Object.assign(promotions.get(id),data);return copy(promotions.get(id));},
    },
    subscriptions:{
      async retrieve(id) {subscriptionReads++;if(!subscriptions.has(id)) throw Object.assign(new Error(),{code:'resource_missing'});return copy(subscriptions.get(id));},
      async list({customer}) {return {data:[...subscriptions.values()].filter(item => item.customer===customer).map(copy),has_more:false};},
    },
    charges:{async retrieve(id){calls.push(['charge-retrieve',id]);return copy(charges.get(id));}},
    invoices:{async retrieve(id){calls.push(['invoice-retrieve',id]);return copy(invoices.get(id));},
      async listLineItems(id,{starting_after,limit}){const lines=invoices.get(id)?.lines || [];const start=starting_after?lines.findIndex(line=>line.id===starting_after)+1:0;
        return {data:copy(lines.slice(start,start+limit)),has_more:start+limit<lines.length};}},
    invoicePayments:{async list(input){calls.push(['invoice-payments',copy(input)]);const list=payments.get(input.payment.payment_intent)||[];
      const start=input.starting_after?list.findIndex(item=>item.id===input.starting_after)+1:0;
      return {data:copy(list.slice(start,start+input.limit)),has_more:start+input.limit<list.length};}},
    disputes:{async retrieve(id){calls.push(['dispute-retrieve',id]);return copy(disputes.get(id));}},
    radar:{earlyFraudWarnings:{async retrieve(id){calls.push(['warning-retrieve',id]);return copy(warnings.get(id));}}},
  };
  const config={priceId:price.id,webhookSecret:secret,baseUrl:'https://taithai.app',mailReady:true,liveMode:false,
    portalConfigurationId:'bpc_manage',quantityPortalConfigurationId:'bpc_quantity',...overrides};
  const service=createBillingService({stripe,store,config,capacity:overrides.capacity,now:()=>time});
  function invoice(id,{quantity=1,subscriptionId='sub_1',start=Math.floor(time/1000),end=start+30*86400,previousQuantity=null,baseInvoiceId='in_current',amountPaid=quantity*9900}={}) {
    const line=(qty,credit=false)=>({id:`il_${id}_${credit?'credit':'debit'}`,amount:credit?-qty*4900:qty*4900,
      quantity:qty,quantity_decimal:String(qty),currency:'thb',livemode:price.livemode,period:{start,end},
      parent:{type:'subscription_item_details',subscription_item_details:{subscription:subscriptionId,subscription_item:'si_mail',proration:previousQuantity!==null,
        proration_details:credit?{credited_items:{invoice:baseInvoiceId,invoice_line_items:[`il_${baseInvoiceId}_debit`]}}:null}},
      pricing:{type:'price_details',price_details:{price:price.id,product:price.product}}});
    const value={id,status:'paid',customer:'cus_1',livemode:price.livemode,currency:'thb',amount_paid:amountPaid,amount_remaining:0,
      parent:{type:'subscription_details',subscription_details:{subscription:subscriptionId}},billing_reason:previousQuantity===null?'subscription_cycle':'subscription_update',
      lines:[...(previousQuantity!==null?[line(previousQuantity,true)]:[]),line(quantity)]};
    invoices.set(id,value);return value;
  }
  async function seed({status='active',paidStatus='paid',quantity=1,invoiceId='in_current',subscriptionId='sub_1'}={}) {
    await store.set(`siteMemberships/${user.uid}`,{uid:user.uid,customerId:'cus_1',livemode:price.livemode,active:false,paid:false,status:'none'});
    await store.set('siteBillingCustomers/cus_1',{uid:user.uid,livemode:price.livemode});
    const sub={id:subscriptionId,customer:'cus_1',status,livemode:price.livemode,cancel_at_period_end:false,
      metadata:{taithai_uid:user.uid,taithai_plan:BILLING_PLAN.id},
      items:{data:[{id:'si_mail',quantity,price:copy(price),current_period_start:Math.floor(time/1000),current_period_end:Math.floor(time/1000)+30*86400}]},
      latest_invoice:{id:invoiceId,status:paidStatus}};
    invoice(invoiceId,{quantity,subscriptionId}).status=paidStatus;
    subscriptions.set(subscriptionId,sub); return sub;
  }
  async function event(type,object,{id=`evt_${randomUUID().replaceAll('-','')}`,livemode=price.livemode}={}) {
    const body=JSON.stringify({id,object:'event',type,livemode,data:{object:copy(object)}});
    const signature=sdk.webhooks.generateTestHeaderString({payload:body,secret});
    return service.webhook({rawBody:Buffer.from(body),signature});
  }
  function riskGraph(invoiceId='in_current') {
    const charge={id:'ch_1',customer:'cus_1',payment_intent:'pi_1',livemode:price.livemode,amount:9900,amount_captured:9900,amount_refunded:0,refunded:false,currency:'thb'};
    charges.set(charge.id,charge);
    invoices.set(invoiceId,{...invoices.get(invoiceId),id:invoiceId,customer:'cus_1',livemode:price.livemode,parent:{type:'subscription_details',subscription_details:{subscription:'sub_1'}}});
    payments.set('pi_1',[{id:'inpay_1',invoice:invoiceId,livemode:price.livemode,status:'paid',payment:{type:'payment_intent',payment_intent:'pi_1'}}]);
    return charge;
  }
  return {service,store,stripe,config,price,calls,sessions,promotions,subscriptions,charges,invoices,payments,disputes,warnings,portalConfigurations,invoice,seed,event,riskGraph,
    advance:milliseconds=>{time+=milliseconds;},now:()=>time,counts:()=>({customerCount,sessionCount,promoCount,couponCount,subscriptionReads})};
}
const createInput = overrides => ({requestId:randomUUID(),name:'Launch offer',percentOff:50,count:2,maxRedemptions:3,duration:'once',...overrides});
const errorCode = code => error => error.code===code;

test('verified auth and owner checks guard every billing mutation; unavailable database remains read-only',async () => {
  const f=fixture();
  await assert.rejects(f.service.getStatus({...user,emailVerified:false}),errorCode('AUTH_REQUIRED'));
  await assert.rejects(f.service.adminCreate(user,createInput()),errorCode('OWNER_REQUIRED'));
  await assert.rejects(f.service.adminDisable(user,{id:'promo_1'}),errorCode('OWNER_REQUIRED'));
  const service=createBillingService({stripe:f.stripe,store:{get(){throw new Error('must not read');}},config:{...f.config,databaseReady:false}});
  assert.equal((await service.getStatus(user)).ready,false);
  assert.equal(f.calls.length,0);
});
test('checkout creates one fixed monthly99THB subscription and reuses an open session across concurrent clicks',async () => {
  const f=fixture();
  const results=await Promise.all([f.service.checkout(user,{requestId:randomUUID()}),f.service.checkout(user,{requestId:randomUUID()})]);
  assert.equal(results[0].url,results[1].url);
  assert.deepEqual(f.counts(),{customerCount:1,sessionCount:1,promoCount:0,couponCount:0,subscriptionReads:0});
  const data=f.calls.find(call=>call[0]==='checkout')[1];
  assert.equal(data.mode,'subscription'); assert.deepEqual(data.line_items,[{price:'price_mail99',quantity:1}]);
  assert.equal(data.allow_promotion_codes,false); assert.equal(data.subscription_data.metadata.taithai_uid,user.uid);
  assert.match(data.integration_identifier,/^taithai-mail-[a-z]{8}$/);
  assert.ok(data.success_url.startsWith('https://taithai.app/membership/'));
  assert.ok(data.expires_at*1000>=f.now()+30*60*1000);
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID(),price:'price_evil'}),errorCode('INVALID_CHECKOUT_INPUT'));
});
test('live checkout fails closed before a customer/session is created when mailbox hosting is not ready',async () => {
  const f=fixture({mailReady:false,liveMode:true});f.price.livemode=true;
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('MAIL_NOT_READY'));
  assert.equal(f.counts().customerCount,0);assert.equal(f.counts().sessionCount,0);
  f.price.unit_amount=1;
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('PRICE_CONFIGURATION_INVALID'));
});
test('a completed Checkout with delayed webhook cannot open a second paid subscription',async () => {
  const f=fixture();const result=await f.service.checkout(user,{requestId:randomUUID()});
  f.sessions.get(result.id).status='complete'; f.sessions.get(result.id).subscription='sub_1';
  f.subscriptions.set('sub_1',{status:'active'});
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('SUBSCRIPTION_PENDING'));
  assert.equal(f.counts().sessionCount,1);
});
test('a missed webhook cannot cause a second charge after the first Checkout expires locally',async () => {
  const f=fixture();await f.service.checkout(user,{requestId:randomUUID()});
  f.subscriptions.set('sub_delayed',{id:'sub_delayed',customer:'cus_1',status:'active',metadata:{taithai_plan:BILLING_PLAN.id}});
  f.advance(40*60*1000);
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('SUBSCRIPTION_EXISTS'));
  assert.equal(f.counts().sessionCount,1);
});
test('Stripe idempotency recovers a session after the persistence acknowledgement fails',async () => {
  const f=fixture(), original=f.store.set;let once=true;
  f.store.set=async(path,...args)=>{if(path.startsWith('siteBillingCheckouts/')&&once){once=false;throw new Error('temporary store failure');}return original(path,...args);};
  const input={requestId:randomUUID()};await assert.rejects(f.service.checkout(user,input));
  const result=await f.service.checkout(user,input);
  assert.ok(result.url);assert.equal(f.counts().sessionCount,1);assert.equal(f.counts().customerCount,1);
});
test('only a signed current invoice.paid grants paid membership, including a100% zero-total invoice',async () => {
  const f=fixture();const sub=await f.seed();
  await f.event('customer.subscription.created',sub);
  assert.deepEqual((await f.service.getStatus(user)).membership,{active:false,paid:false,status:'payment_pending',currentPeriodEnd:new Date(sub.items.data[0].current_period_end*1000).toISOString(),cancelAtPeriodEnd:false});
  assert.equal((await f.service.getStatus(user)).checkoutAvailable,false);
  assert.equal((await f.store.get(`siteMemberships/${user.uid}`)).status,'active');
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('SUBSCRIPTION_EXISTS'));
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',amount_paid:0,parent:{subscription_details:{subscription:'sub_1'}}});
  assert.equal((await f.service.getStatus(user)).membership.paid,true);
});
test('actual Stripe SDK rejects altered raw bodies and duplicate signed events are processed once',async () => {
  const f=fixture();const sub=await f.seed();
  const body=JSON.stringify({id:'evt_signature',type:'customer.subscription.updated',livemode:false,data:{object:sub}});
  const signature=sdk.webhooks.generateTestHeaderString({payload:body,secret});
  await assert.rejects(f.service.webhook({rawBody:body+' ',signature}),errorCode('INVALID_WEBHOOK_SIGNATURE'));
  await assert.rejects(f.service.webhook({rawBody:JSON.parse(body),signature}),errorCode('INVALID_WEBHOOK'));
  await f.service.webhook({rawBody:body,signature});const count=f.counts().subscriptionReads;
  assert.equal((await f.service.webhook({rawBody:body,signature})).duplicate,true);
  assert.equal(f.counts().subscriptionReads,count);
});
test('late paid events cannot resurrect a canceled subscription or pay a different renewal invoice',async () => {
  const f=fixture();const sub=await f.seed();
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  sub.status='canceled';f.subscriptions.set(sub.id,sub);
  await f.event('customer.subscription.deleted',{...sub,status:'active'});
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  sub.status='active';sub.latest_invoice={id:'in_new',status:'open'};f.subscriptions.set(sub.id,sub);
  // A renewal advances the paid period. An unrelated same-period unpaid
  // upgrade must instead retain the already paid base quantity.
  f.advance(30*86400000);sub.items.data[0].current_period_start=sub.items.data[0].current_period_end;
  sub.items.data[0].current_period_end+=30*86400;
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
  assert.equal((await f.service.getStatus(user)).membership.status,'payment_pending');
});
test('unapproved quantities revoke entitlement and an archived price still permits cancellation reconciliation',async () => {
  const f=fixture();const sub=await f.seed();
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  sub.items.data[0].quantity=1.5;f.subscriptions.set(sub.id,sub);
  await f.event('customer.subscription.updated',sub);
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  sub.items.data[0].quantity=1;sub.items.data[0].price.active=false;sub.status='canceled';f.subscriptions.set(sub.id,sub);
  await f.event('customer.subscription.deleted',sub);
  assert.equal((await f.service.getStatus(user)).membership.status,'canceled');
});
test('webhook store failures remain retryable and test/live mode mismatches never grant entitlement',async () => {
  const f=fixture();const sub=await f.seed();
  await assert.rejects(f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'},{livemode:true}),errorCode('BILLING_MODE_MISMATCH'));
  const original=f.store.set;let once=true;
  f.store.set=async(path,...args)=>{if(path.startsWith('siteMemberships/')&&once){once=false;throw new Error('offline');}return original(path,...args);};
  const invoice={id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'};
  await assert.rejects(f.event('invoice.paid',invoice,{id:'evt_retry'}));
  assert.equal(await f.store.get('siteBillingEvents/evt_retry'),null);
  await f.event('invoice.paid',invoice,{id:'evt_retry'});
  assert.equal((await f.service.getStatus(user)).membership.paid,true);
});
test('Billing Portal only uses the authenticated customer and remains available during mailbox outages',async () => {
  const f=fixture({mailReady:false});await f.seed();
  assert.ok((await f.service.portal(user)).url.startsWith('https://billing.stripe.com/'));
  assert.equal(f.calls.find(call=>call[0]==='portal')[1].customer,'cus_1');
  await assert.rejects(f.service.portal({...user,uid:'different'}),errorCode('CUSTOMER_NOT_FOUND'));
});
test('batch discounts use product-scoped coupons with duration, cap, expiry and current promotion API shape',async () => {
  const f=fixture();const expiresAt=new Date(f.now()+86400000).toISOString();
  const result=await f.service.adminCreate(owner,createInput({percentOff:100,duration:'repeating',durationInMonths:3,expiresAt}));
  const coupon=f.calls.find(call=>call[0]==='coupon')[1];
  assert.deepEqual(coupon.applies_to,{products:['prod_mail']});assert.equal(coupon.percent_off,100);
  assert.equal(coupon.duration,'repeating');assert.equal(coupon.duration_in_months,3);assert.equal(coupon.max_redemptions,6);
  assert.equal(coupon.redeem_by,Math.floor(Date.parse(expiresAt)/1000));
  const promotion=f.calls.find(call=>call[0]==='promotion')[1];
  assert.deepEqual(promotion.promotion,{type:'coupon',coupon:coupon.id});assert.equal(promotion.max_redemptions,3);
  assert.equal(result.discounts.length,2);assert.equal(result.startTimeEnforcement,'application');
  await assert.rejects(f.service.adminCreate(owner,createInput({percentOff:101})),errorCode('INVALID_DISCOUNT_PERCENT'));
  await assert.rejects(f.service.adminCreate(owner,createInput({count:101})),errorCode('INVALID_CODE_COUNT'));
});
test('future-start discounts cannot be entered through hosted Checkout and activate only after application validation',async () => {
  const f=fixture();const result=await f.service.adminCreate(owner,createInput({startsAt:new Date(f.now()+3600000).toISOString()}));
  const code=result.discounts[0];assert.equal(f.promotions.get(code.id).active,false);
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID(),promotionCode:code.code}),errorCode('PROMOTION_NOT_STARTED'));
  assert.equal(f.counts().sessionCount,0);
  f.advance(3601000);
  await f.service.checkout(user,{requestId:randomUUID(),promotionCode:code.code.toLowerCase()});
  assert.equal(f.promotions.get(code.id).active,true);
  const data=f.calls.find(call=>call[0]==='checkout')[1];assert.equal(data.allow_promotion_codes,false);
  assert.deepEqual(data.discounts,[{promotion_code:code.id}]);
});
test('batch retries remain idempotent when immediate startsAt was omitted, and disabled codes cannot be reactivated',async () => {
  const f=fixture(), input=createInput({duration:'forever'});
  const first=await f.service.adminCreate(owner,input);f.advance(2000);
  const second=await f.service.adminCreate(owner,input);
  assert.deepEqual(first.discounts.map(x=>x.id),second.discounts.map(x=>x.id));assert.equal(f.counts().couponCount,1);assert.equal(f.counts().promoCount,2);
  await f.service.adminDisable(owner,{batchId:first.batchId});
  assert.ok([...f.promotions.values()].every(item=>item.active===false));
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID(),promotionCode:first.discounts[0].code}),errorCode('PROMOTION_UNAVAILABLE'));
  await assert.rejects(f.service.adminCreate(owner,input),errorCode('DISCOUNT_BATCH_DISABLED'));
  await assert.rejects(f.service.adminDisable(owner,{id:'../../siteMemberships/member_1'}),errorCode('INVALID_DISCOUNT_TARGET'));
});
test('owner listing refreshes redemption counts and exhausted state from Stripe instead of cached creation data',async () => {
  const f=fixture();const result=await f.service.adminCreate(owner,createInput());
  const native=f.promotions.get(result.discounts[0].id);native.times_redeemed=3;native.active=false;
  const listed=await f.service.adminList(owner);const code=listed.discounts.find(item=>item.id===native.id);
  assert.equal(code.timesRedeemed,3);assert.equal(code.status,'exhausted');assert.equal(code.active,false);
});
test('webhook mode mismatch is rejected before locks, persistence or Stripe reconciliation, including unrelated event types',async () => {
  const f=fixture({liveMode:true});f.price.livemode=true;
  const body=JSON.stringify({id:'evt_wrong_mode',type:'customer.created',livemode:false,data:{object:{id:'cus_any'}}});
  const signature=sdk.webhooks.generateTestHeaderString({payload:body,secret});
  await assert.rejects(f.service.webhook({rawBody:body,signature}),errorCode('BILLING_MODE_MISMATCH'));
  assert.equal(f.store.docs.size,0);assert.equal(f.counts().subscriptionReads,0);
  f.price.livemode=false;
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID()}),errorCode('BILLING_MODE_MISMATCH'));
  assert.equal(f.counts().customerCount,0);
});
test('public membership never treats a test record as live paid access and requires explicit service mode',async () => {
  const f=fixture({liveMode:true});
  await f.store.set(`siteMemberships/${user.uid}`,{active:true,paid:true,status:'active',livemode:false,currentPeriodEnd:new Date(f.now()+86400000).toISOString()});
  assert.deepEqual((await f.service.getStatus(user)).membership.active,false);
  assert.deepEqual((await f.service.getStatus(user)).membership.paid,false);
  const noMode=createBillingService({stripe:f.stripe,store:f.store,config:{...f.config,liveMode:undefined}});
  assert.equal((await noMode.getStatus(user)).ready,false);
  await assert.rejects(noMode.checkout(user,{requestId:randomUUID()}),errorCode('BILLING_NOT_CONFIGURED'));
  const badConfig=createBillingService({stripe:f.stripe,store:f.store,config:{...f.config,stripeConfigured:false}});
  assert.equal((await badConfig.getStatus(user)).ready,false);
  await assert.rejects(badConfig.checkout(user,{requestId:randomUUID()}),errorCode('BILLING_NOT_CONFIGURED'));
});
test('a current full refund revokes invoice access and later paid events cannot erase the risk hold',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const charge=f.riskGraph();charge.amount_refunded=9900;charge.refunded=true;
  await f.event('charge.refunded',{id:charge.id,refunded:false},{id:'evt_full_refund'});
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
  assert.equal((await f.service.getStatus(user)).membership.status,'payment_review');
  assert.equal((await f.service.getStatus(user)).membership.riskBlocked,true);
  const proof=await f.store.get('siteBillingInvoices/in_current');assert.equal(proof.paid,true);assert.equal(proof.riskBlocked,true);
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
  assert.equal((await f.event('charge.refunded',{id:charge.id},{id:'evt_full_refund'})).duplicate,true);
  const risks=(await f.service.adminList(owner)).riskEvents;assert.equal(risks.length,1);assert.equal(risks[0].reviewRequired,true);
});
test('a partial refund raises an owner review without revoking an otherwise paid current cycle',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const charge=f.riskGraph();charge.amount_refunded=1000;
  await f.event('charge.refunded',{id:charge.id});
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  const [risk]=await f.store.list('siteBillingRisks');assert.equal(risk.status,'partially_refunded');assert.equal(risk.blocked,false);
});
test('dispute ownership follows invoice graph, and fresh won closure resists out-of-order created events',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});f.riskGraph();
  const dispute={id:'du_1',charge:'ch_1',payment_intent:null,livemode:false,status:'needs_response'};f.disputes.set(dispute.id,dispute);
  await f.event('charge.dispute.created',{id:dispute.id,customer:'wrong_customer',metadata:{taithai_uid:'wrong_user'}});
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  dispute.status='won';
  await f.event('charge.dispute.closed',{id:dispute.id});
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  await f.event('charge.dispute.created',{id:dispute.id,status:'needs_response'});
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  assert.equal((await f.store.list('siteBillingRisks')).length,1);
});
test('a fraud warning blocks its current invoice and a won separate dispute cannot clear that warning',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});f.riskGraph();
  f.warnings.set('issfr_1',{id:'issfr_1',charge:'ch_1',payment_intent:null,livemode:false,actionable:true});
  await f.event('radar.early_fraud_warning.created',{id:'issfr_1'});
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  f.disputes.set('du_1',{id:'du_1',charge:'ch_1',livemode:false,status:'won'});
  await f.event('charge.dispute.closed',{id:'du_1'});
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
  assert.equal((await f.store.list('siteBillingRisks')).length,2);
});
test('risk on a previous invoice records review but cannot revoke a separately paid new cycle',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const charge=f.riskGraph('in_old');charge.refunded=true;charge.amount_refunded=9900;
  await f.event('charge.refunded',{id:charge.id});
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  assert.equal((await f.store.get('siteBillingInvoices/in_old')).riskBlocked,true);
  assert.equal((await f.store.get(`siteMemberships/${user.uid}`)).riskBlocked,false);
});
test('risk graph paginates all InvoicePayments and deduplicates invoice links',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const charge=f.riskGraph();charge.refunded=true;
  f.invoices.set('in_old',{...f.invoices.get('in_current'),id:'in_old'});
  f.payments.set('pi_1',Array.from({length:101},(_,index)=>({id:`inpay_${index}`,invoice:index===100?'in_old':'in_current',livemode:false,payment:{type:'payment_intent',payment_intent:'pi_1'}})));
  await f.event('charge.refunded',{id:charge.id});
  assert.equal(f.calls.filter(call=>call[0]==='invoice-payments').length,2);
  assert.equal((await f.store.list('siteBillingRisks')).length,2);
  assert.equal((await f.service.getStatus(user)).membership.paid,false);
});
test('unresolved and unrelated customer risks are owner-review records without user metadata based revocation',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const charge=f.riskGraph();charge.customer='cus_other';charge.refunded=true;
  f.invoices.get('in_current').customer='cus_other';
  await f.event('charge.refunded',{id:charge.id,customer:'cus_1',metadata:{taithai_uid:user.uid}});
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  assert.equal((await f.store.list('siteBillingRisks'))[0].reason,'NO_APPLICATION_CUSTOMER');
  charge.payment_intent=null;
  await f.event('charge.refunded',{id:charge.id});
  assert.ok((await f.store.list('siteBillingRisks')).some(risk=>risk.reason==='NO_PAYMENT_INTENT'));
});
test('risk received before invoice.paid cannot be overwritten into a free paid entitlement',async()=>{
  const f=fixture();await f.seed();const charge=f.riskGraph();charge.refunded=true;
  await f.event('charge.refunded',{id:charge.id});
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  assert.equal((await f.service.getStatus(user)).membership.active,false);
  assert.equal((await f.store.get('siteBillingInvoices/in_current')).riskBlocked,true);
});
test('concurrent slow dispute creation cannot overwrite a newer won resolution',async()=>{
  const f=fixture();await f.seed();await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});f.riskGraph();
  const dispute={id:'du_1',charge:'ch_1',livemode:false,status:'needs_response'};f.disputes.set(dispute.id,dispute);
  const original=f.stripe.disputes.retrieve;let first=true,release,started;
  const began=new Promise(resolve=>{started=resolve;});const pause=new Promise(resolve=>{release=resolve;});
  f.stripe.disputes.retrieve=async id=>{if(first){first=false;const snapshot=copy(dispute);started();await pause;return snapshot;}return original(id);};
  const creation=f.event('charge.dispute.created',{id:dispute.id});await began;
  dispute.status='won';const closure=f.event('charge.dispute.closed',{id:dispute.id});
  await new Promise(resolve=>setImmediate(resolve));release();await Promise.all([creation,closure]);
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  assert.equal((await f.store.list('siteBillingRisks'))[0].status,'won');
});
test('a refund of an older canceled subscription cannot replace a newer active subscription membership',async()=>{
  const f=fixture();const current=await f.seed();
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  f.subscriptions.set('sub_old',{...copy(current),id:'sub_old',status:'canceled',latest_invoice:{id:'in_old',status:'paid'}});
  const charge=f.riskGraph('in_old');charge.refunded=true;charge.amount_refunded=9900;
  f.invoices.get('in_old').parent.subscription_details.subscription='sub_old';
  await f.event('charge.refunded',{id:charge.id});
  const record=await f.store.get(`siteMemberships/${user.uid}`);
  assert.equal(record.subscriptionId,'sub_1');assert.equal(record.active,true);assert.equal(record.paid,true);
  assert.equal((await f.store.list('siteBillingRisks'))[0].subscriptionId,'sub_old');
});

test('two mailboxes cost198THB/month on the fixed unit price, including a100% coupon',async()=>{
  const f=fixture(), offer=await f.service.adminCreate(owner,createInput({percentOff:100,count:1}));
  const checkout=await f.service.checkout(user,{quantity:2,requestId:randomUUID(),promotionCode:offer.discounts[0].code});
  assert.equal(checkout.quantity,2);
  const data=f.calls.find(call=>call[0]==='checkout')[1];
  assert.deepEqual(data.line_items,[{price:'price_mail99',quantity:2}]);
  assert.deepEqual(data.discounts,[{promotion_code:offer.discounts[0].id}]);
  assert.equal((await f.service.getStatus(user)).mailboxLimit,0);
  await f.seed({quantity:2});f.invoices.get('in_current').amount_paid=0;
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:'sub_1'});
  const status=await f.service.getStatus(user);
  assert.equal(status.quantity,2);assert.equal(status.mailboxLimit,2);assert.equal(status.unitAmount,9900);assert.equal(status.totalAmount,19800);
  const record=await f.store.get(`siteMemberships/${user.uid}`);
  assert.equal(record.amount,9900);assert.equal(record.mailboxes,2);assert.equal(record.quantity,2);
});
test('Checkout quantities reject strings, fractions and bounds; immutable retry cannot change quantity',async()=>{
  const f=fixture();
  for(const quantity of [0,-1,1.5,'2',null,Infinity,Number.MAX_SAFE_INTEGER+1]) await assert.rejects(f.service.checkout(user,{quantity,requestId:randomUUID()}),errorCode('INVALID_MAILBOX_QUANTITY'));
  await assert.rejects(f.service.checkout(user,{quantity:Number.MAX_SAFE_INTEGER,requestId:randomUUID()}),errorCode('BILLING_AMOUNT_TOO_LARGE'));
  assert.equal(f.counts().sessionCount,0);
  const original=f.store.set;let once=true;
  f.store.set=async(path,...args)=>{if(path.startsWith('siteBillingCheckouts/')&&once){once=false;throw Error('ack failed');}return original(path,...args);};
  const requestId=randomUUID();await assert.rejects(f.service.checkout(user,{quantity:2,requestId}));
  await assert.rejects(f.service.checkout(user,{quantity:3,requestId}),errorCode('REQUEST_ID_REUSED'));
  await f.service.checkout(user,{quantity:2,requestId});assert.equal(f.counts().sessionCount,1);
  await assert.rejects(f.service.checkout(user,{quantity:3,requestId:randomUUID()}),errorCode('CHECKOUT_ALREADY_OPEN'));
  const transformed=fixture();transformed.price.transform_quantity={divide_by:5,round:'up'};
  await assert.rejects(transformed.service.checkout(user,{quantity:2,requestId:randomUUID()}),errorCode('PRICE_CONFIGURATION_INVALID'));
  assert.equal(transformed.counts().sessionCount,0);
});
async function paidBase(f,quantity=1) {
  const sub=await f.seed({quantity});
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',status:'paid',subscription:sub.id});
  return sub;
}
function upgradeInvoice(f,sub,{id='in_upgrade',quantity=2,previousQuantity=1,baseInvoiceId='in_current',zero=false}={}) {
  const value=f.invoice(id,{quantity,previousQuantity,baseInvoiceId,start:sub.items.data[0].current_period_start+1,end:sub.items.data[0].current_period_end});
  if(zero){value.amount_paid=0;for(const line of value.lines)line.amount=0;}
  sub.latest_invoice={id,status:'paid'};sub.items.data[0].quantity=quantity;f.advance(2000);return value;
}
test('hosted quantity confirmation binds own existing item and serializes repeated requests without granting seats',async()=>{
  const f=fixture();await paidBase(f);
  assert.equal((await f.service.getStatus(user)).quantityUpdateAvailable,true);
  const input={quantity:2,requestId:randomUUID()};
  const [a,b]=await Promise.all([f.service.updateQuantity(user,input),f.service.updateQuantity(user,input)]);
  assert.deepEqual(a,b);assert.equal(a.pending,true);assert.equal(a.quantity,2);
  const calls=f.calls.filter(call=>call[0]==='portal');assert.equal(calls.length,1);
  assert.equal(calls[0][1].customer,'cus_1');assert.equal(calls[0][1].configuration,'bpc_quantity');
  assert.deepEqual(calls[0][1].flow_data.subscription_update_confirm,{subscription:'sub_1',items:[{id:'si_mail',price:'price_mail99',quantity:2}]});
  assert.equal(calls[0][1].flow_data.after_completion.redirect.return_url,'https://taithai.app/membership/?quantity=review');
  const status=await f.service.getStatus(user);assert.equal(status.quantity,1);assert.equal(status.pendingQuantity,2);assert.equal(status.quantityUpdateAvailable,true);
  await assert.rejects(f.service.updateQuantity(user,{quantity:3,requestId:randomUUID()}),errorCode('QUANTITY_UPDATE_PENDING'));
  await assert.rejects(f.service.updateQuantity(user,{quantity:1,requestId:randomUUID()}),errorCode('QUANTITY_UNCHANGED'));
  await assert.rejects(f.service.updateQuantity({...user,uid:'other'},{quantity:2,requestId:randomUUID()}),errorCode('PAID_MEMBERSHIP_REQUIRED'));
});
test('upgrade config must restrict fixed product/price and immediately invoice; ordinary portal cannot change quantity',async()=>{
  for(const mutate of [config=>{config.features.subscription_update.proration_behavior='none';},config=>{config.features.subscription_update.products[0].prices.push('price_other');},
    config=>{config.features.subscription_update.default_allowed_updates.push('price');},config=>{config.features.subscription_update.schedule_at_period_end.conditions=[{type:'decreasing_item_amount'}];},
    config=>{config.features.subscription_update.products[0].adjustable_quantity.maximum=1.5;},config=>{config.is_default=true;}]) {
    const f=fixture();await paidBase(f);mutate(f.portalConfigurations.get('bpc_quantity'));
    assert.equal((await f.service.getStatus(user)).quantityUpdateAvailable,false);
    await assert.rejects(f.service.updateQuantity(user,{quantity:2,requestId:randomUUID()}),errorCode('QUANTITY_UPDATE_NOT_CONFIGURED'));
    assert.equal(f.calls.filter(call=>call[0]==='portal').length,0);
  }
  const f=fixture();await paidBase(f);f.portalConfigurations.get('bpc_manage').features.subscription_update.enabled=true;
  await assert.rejects(f.service.updateQuantity(user,{quantity:2,requestId:randomUUID()}),errorCode('QUANTITY_UPDATE_NOT_CONFIGURED'));
});
test('unpaid mutable subscription quantity preserves the already paid base and failed upgrade cannot grant more',async()=>{
  const f=fixture(), sub=await paidBase(f);
  await f.service.updateQuantity(user,{quantity:2,requestId:randomUUID()});
  sub.items.data[0].quantity=2;sub.latest_invoice={id:'in_unpaid',status:'open'};
  await f.event('customer.subscription.updated',sub);
  let status=await f.service.getStatus(user);assert.equal(status.quantity,1);assert.equal(status.pendingQuantity,2);assert.equal(status.membership.active,true);
  await f.event('invoice.payment_failed',{id:'in_unpaid',customer:'cus_1',subscription:'sub_1',status:'open'});
  status=await f.service.getStatus(user);assert.equal(status.quantity,1);assert.equal(status.totalAmount,9900);
  sub.status='past_due';await f.event('customer.subscription.updated',sub);
  assert.equal((await f.service.getStatus(user)).membership.active,true);
  // Merely presenting an old one-seat paid invoice with a two-seat subscription
  // must never infer that the second seat was paid.
  await f.event('invoice.paid',{id:'in_current',customer:'cus_1',subscription:'sub_1',status:'paid',quantity:20});
  assert.equal((await f.service.getStatus(user)).quantity,1);
});
test('paid zero-total upgrade binds credited base invoice and grants only after Stripe applies the quantity',async()=>{
  const f=fixture(), sub=await paidBase(f);
  const invoice=upgradeInvoice(f,sub,{zero:true});sub.items.data[0].quantity=1;sub.pending_update={subscription_items:[{id:'si_mail',quantity:2}]};
  await f.event('invoice.paid',invoice);assert.equal((await f.service.getStatus(user)).quantity,1);
  sub.items.data[0].quantity=2;sub.pending_update=null;
  await f.event('customer.subscription.pending_update_applied',sub);
  const status=await f.service.getStatus(user);assert.equal(status.quantity,2);assert.equal(status.pendingQuantity,null);assert.equal(status.totalAmount,19800);
});
test('invoice quantity proof reads all pages and ignores client event quantity, foreign lines and future paid periods',async()=>{
  const f=fixture(),sub=await f.seed({quantity:2}),invoice=f.invoices.get('in_current');
  const actual=invoice.lines[0];invoice.lines=Array.from({length:100},(_,i)=>({...copy(actual),id:`il_other_${i}`,pricing:{price_details:{price:'price_other',product:'prod_other'}}}));
  invoice.lines.push(actual);
  await f.event('invoice.paid',{...invoice,quantity:20,lines:[]});assert.equal((await f.service.getStatus(user)).quantity,2);
  sub.items.data[0].current_period_end+=30*86400;sub.latest_invoice={id:'in_future',status:'paid'};
  const future=f.invoice('in_future',{quantity:2,start:Math.floor(f.now()/1000)+30*86400,end:sub.items.data[0].current_period_end});
  await f.event('invoice.paid',future);assert.equal((await f.service.getStatus(user)).quantity,0);
});
test('late base payment resolves an out-of-order upgrade; mismatched item, credit or invoice cannot grant seats',async()=>{
  const f=fixture(),sub=await f.seed();const invoice=upgradeInvoice(f,sub);
  await f.event('invoice.paid',invoice);assert.equal((await f.service.getStatus(user)).quantity,0);
  await f.event('invoice.paid',f.invoices.get('in_current'));assert.equal((await f.service.getStatus(user)).quantity,2);
  const g=fixture(),other=await paidBase(g),bad=upgradeInvoice(g,other,{baseInvoiceId:'in_unrelated'});
  await g.event('invoice.paid',bad);assert.equal((await g.service.getStatus(user)).quantity,1);
  const h=fixture(),third=await paidBase(h),wrong=upgradeInvoice(h,third);
  wrong.lines.at(-1).parent.subscription_item_details.subscription_item='si_other';
  await h.event('invoice.paid',wrong);assert.equal((await h.service.getStatus(user)).quantity,1);
});
test('refunded paid upgrade falls back to paid base; refunded base invalidates dependent proration grants',async()=>{
  const f=fixture(),sub=await paidBase(f);
  await f.event('invoice.paid',upgradeInvoice(f,sub));assert.equal((await f.service.getStatus(user)).quantity,2);
  await f.event('invoice.paid',upgradeInvoice(f,sub,{id:'in_upgrade3',quantity:3,previousQuantity:2,baseInvoiceId:'in_upgrade'}));
  assert.equal((await f.service.getStatus(user)).quantity,3);
  let charge=f.riskGraph('in_upgrade');charge.refunded=true;charge.amount_refunded=9900;
  await f.event('charge.refunded',{id:charge.id});
  let status=await f.service.getStatus(user);assert.equal(status.quantity,1);assert.equal(status.membership.active,true);
  await f.event('invoice.paid',f.invoices.get('in_upgrade3'));assert.equal((await f.service.getStatus(user)).quantity,1);
  charge=f.riskGraph('in_current');charge.refunded=true;charge.amount_refunded=9900;
  await f.event('charge.refunded',{id:charge.id});status=await f.service.getStatus(user);
  assert.equal(status.quantity,0);assert.equal(status.membership.active,false);assert.equal(status.membership.riskBlocked,true);
});
test('full paid renewal establishes its own quantity and ignores old-cycle upgrade/refund changes',async()=>{
  const f=fixture(),sub=await paidBase(f);await f.event('invoice.paid',upgradeInvoice(f,sub));
  f.advance(30*86400000);sub.items.data[0].current_period_start=sub.items.data[0].current_period_end;
  sub.items.data[0].current_period_end+=30*86400;sub.latest_invoice={id:'in_renewal',status:'paid'};
  const renewal=f.invoice('in_renewal',{quantity:2,start:sub.items.data[0].current_period_start,end:sub.items.data[0].current_period_end});
  await f.event('invoice.paid',renewal);assert.equal((await f.service.getStatus(user)).quantity,2);
  const charge=f.riskGraph('in_current');charge.refunded=true;await f.event('charge.refunded',{id:charge.id});
  await f.event('invoice.paid',f.invoices.get('in_upgrade'));assert.equal((await f.service.getStatus(user)).quantity,2);
});
test('quantity decreases, invalid modes, pending subscriptions and competing subscriptions fail before hosted mutation',async()=>{
  const f=fixture(),sub=await paidBase(f,2);
  await assert.rejects(f.service.updateQuantity(user,{quantity:1,requestId:randomUUID()}),errorCode('QUANTITY_DECREASE_UNSUPPORTED'));
  sub.pending_update={subscription_items:[{id:'si_mail',quantity:3}]};
  await assert.rejects(f.service.updateQuantity(user,{quantity:3,requestId:randomUUID()}),errorCode('QUANTITY_UPDATE_PENDING'));
  sub.pending_update=null;f.subscriptions.set('sub_other',{...copy(sub),id:'sub_other'});
  await assert.rejects(f.service.updateQuantity(user,{quantity:3,requestId:randomUUID()}),errorCode('BILLING_STATE_UNAVAILABLE'));
  assert.equal(f.calls.filter(call=>call[0]==='portal').length,0);
});
test('capacity is reserved before chargeable sessions, exact expired Checkout releases, paid proof settles',async()=>{
  const calls=[],capacity={async reserve(input){calls.push(['reserve',input]);return 'hold_1';},async bindCheckout(input){calls.push(['bind',input]);},
    async releaseCheckout(input){calls.push(['release',input]);},async settle(input){calls.push(['settle',input]);}};
  const f=fixture({capacity});const session=await f.service.checkout(user,{quantity:2,requestId:randomUUID()});
  assert.equal(calls[0][0],'reserve');assert.equal(calls[0][1].quantity,2);assert.deepEqual(calls[1],['bind',{uid:user.uid,reservationId:'hold_1',sessionId:session.id}]);
  await assert.rejects(f.event('checkout.session.expired',{id:session.id,customer:'cus_1'}),errorCode('BILLING_STATE_UNAVAILABLE'));
  assert.equal(calls.filter(call=>call[0]==='release').length,0);
  f.sessions.get(session.id).status='expired';await f.event('checkout.session.expired',{id:session.id,customer:'cus_1'});
  assert.deepEqual(calls.at(-1),['release',{uid:user.uid,sessionId:session.id}]);
  await paidBase(f,2);assert.equal(calls.at(-1)[0],'settle');
  const blocked=fixture({capacity:{async reserve(){throw Object.assign(Error(),{code:'MAIL_CAPACITY_UNAVAILABLE'});}}});
  await assert.rejects(blocked.service.checkout(user,{quantity:2,requestId:randomUUID()}),errorCode('MAIL_CAPACITY_UNAVAILABLE'));
  assert.equal(blocked.counts().sessionCount,0);
});
test('explicit same-target Portal refresh reuses capacity; retries after store acknowledgement failure use Stripe idempotency',async()=>{
  let reserves=0;const capacity={async reserve(){reserves++;return 'hold_1';},async settle(){}};
  const f=fixture({capacity});await paidBase(f);
  const input={quantity:2,requestId:randomUUID()};await f.service.updateQuantity(user,input);
  const refreshed={quantity:2,requestId:randomUUID()};await f.service.updateQuantity(user,refreshed);
  assert.equal(reserves,1);assert.equal(f.calls.filter(call=>call[0]==='portal').length,2);
  await f.service.updateQuantity(user,refreshed);assert.equal(f.calls.filter(call=>call[0]==='portal').length,2);
  const before=await f.store.get(`siteMemberships/${user.uid}`);assert.equal(before.mailboxes,1);assert.equal(before.pendingQuantity,2);
  const g=fixture({capacity});await paidBase(g);const original=g.store.set;let once=true;
  g.store.set=async(path,data,...args)=>{if(path===`siteBillingQuantityUpdates/${user.uid}`&&data.state==='open'&&once){once=false;throw Error('ack failed');}return original(path,data,...args);};
  const attempt={quantity:2,requestId:randomUUID()};await assert.rejects(g.service.updateQuantity(user,attempt));
  await assert.rejects(g.service.updateQuantity(user,{quantity:3,requestId:randomUUID()}),errorCode('QUANTITY_UPDATE_PENDING'));
  await g.service.updateQuantity(user,attempt);
  const calls=g.calls.filter(call=>call[0]==='portal');assert.equal(calls.length,2);assert.equal(calls[0][2].idempotencyKey,calls[1][2].idempotencyKey);
});
test('mailbox purchases and paid upgrades above20 keep the same99THB unit price without a product maximum',async()=>{
  const f=fixture();await f.service.checkout(user,{quantity:250,requestId:randomUUID()});
  assert.deepEqual(f.calls.find(call=>call[0]==='checkout')[1].line_items,[{price:'price_mail99',quantity:250}]);
  await paidBase(f,250);const status=await f.service.getStatus(user);
  assert.equal(status.quantity,250);assert.equal(status.totalAmount,2475000);assert.equal(Object.hasOwn(status,'maxQuantity'),false);
  const g=fixture(),sub=await paidBase(g,21);
  await g.service.updateQuantity(user,{quantity:250,requestId:randomUUID()});
  assert.equal((await g.service.getStatus(user)).quantity,21);
  await g.event('invoice.paid',upgradeInvoice(g,sub,{quantity:250,previousQuantity:21}));
  assert.equal((await g.service.getStatus(user)).quantity,250);
});
test('native Portal transaction bounds are technical errors and never impose the former20-box product limit',async()=>{
  const f=fixture();await paidBase(f,25);
  f.portalConfigurations.get('bpc_quantity').features.subscription_update.products[0].adjustable_quantity.maximum=999999;
  await f.service.updateQuantity(user,{quantity:1000,requestId:randomUUID()});
  assert.equal(f.calls.find(call=>call[0]==='portal')[1].flow_data.subscription_update_confirm.items[0].quantity,1000);
  await assert.rejects(f.service.updateQuantity(user,{quantity:1000000,requestId:randomUUID()}),errorCode('STRIPE_QUANTITY_LIMIT'));
  const g=fixture();g.stripe.checkout.sessions.create=async()=>{throw {type:'StripeInvalidRequestError',code:'amount_too_large',message:'must not leak provider detail'};};
  await assert.rejects(g.service.checkout(user,{quantity:1000,requestId:randomUUID()}),error=>error.code==='BILLING_AMOUNT_TOO_LARGE' && error.status===400 && !error.message.includes('provider detail'));
});
test('out-of-order paid quantity dependency chains can resolve beyond20 increments',async()=>{
  const f=fixture(),sub=await f.seed();const values=[];
  for(let quantity=2;quantity<=27;quantity++)values.push(f.invoice(`in_step${quantity}`,{quantity,previousQuantity:quantity-1,
    baseInvoiceId:quantity===2?'in_current':`in_step${quantity-1}`,start:sub.items.data[0].current_period_start+quantity,end:sub.items.data[0].current_period_end}));
  sub.items.data[0].quantity=27;sub.latest_invoice={id:'in_step27',status:'paid'};f.advance(30000);
  for(const invoice of values.reverse())await f.event('invoice.paid',invoice);
  assert.equal((await f.service.getStatus(user)).quantity,0);
  await f.event('invoice.paid',f.invoices.get('in_current'));
  assert.equal((await f.service.getStatus(user)).quantity,27);
});
test('live quantity updates require explicit verified flag before any remote call or capacity claim',async()=>{
  let reserves=0;const f=fixture({liveMode:true,capacity:{async reserve(){reserves++;},async settle(){}}});f.price.livemode=true;
  await paidBase(f);f.calls.length=0;
  assert.equal((await f.service.getStatus(user)).quantityUpdateAvailable,false);assert.equal(f.calls.length,0);
  await assert.rejects(f.service.updateQuantity(user,{quantity:25,requestId:randomUUID()}),error=>error.code==='QUANTITY_UPDATES_NOT_READY' && error.status===503);
  assert.equal(reserves,0);assert.equal(f.calls.length,0);assert.equal(await f.store.get(`siteBillingQuantityUpdates/${user.uid}`),null);
  const verified=fixture({liveMode:true,quantityUpdatesVerified:true});verified.price.livemode=true;
  for(const value of verified.portalConfigurations.values())value.livemode=true;
  await paidBase(verified);assert.equal((await verified.service.getStatus(user)).quantityUpdateAvailable,true);
  assert.equal((await verified.service.updateQuantity(user,{quantity:25,requestId:randomUUID()})).quantity,25);
});
test('a100-code batch returns honest bounded progress and resumes without re-querying finished native prefixes',async()=>{
  const f=fixture(),input=createInput({count:100});let result=await f.service.adminCreate(owner,input);
  assert.equal(result.complete,false);assert.equal(result.state,'creating');assert.equal(result.completed,8);assert.equal(result.total,100);
  const firstIds=result.discounts.map(record=>record.id),firstCodes=result.discounts.map(record=>record.code);
  f.calls.length=0;
  result=await f.service.adminCreate(owner,input);
  assert.equal(result.completed,16);assert.equal(result.discounts.length,16);assert.deepEqual(result.discounts.slice(0,8).map(row=>row.id),firstIds);
  assert.ok(f.calls.filter(call=>call[0]==='promotionList').every(call=>!firstCodes.includes(call[1])));
  while(!result.complete)result=await f.service.adminCreate(owner,input);
  assert.equal(result.completed,100);assert.equal(result.discounts.length,100);assert.equal(result.state,'complete');
  assert.equal(f.counts().promoCount,100);assert.equal(f.counts().couponCount,1);
  f.calls.length=0;const receipt=await f.service.adminCreate(owner,input);assert.equal(receipt.complete,true);assert.equal(f.calls.length,0);
  const rates=await f.store.list('siteBillingAdminCreationRates');assert.equal(rates.length,1);assert.equal(rates[0].count,1);
});
test('partial batch codes cannot redeem early and immutable parameters survive resumed progress',async()=>{
  const f=fixture(),input=createInput({count:10});const first=await f.service.adminCreate(owner,input);
  const partial=await f.service.adminList(owner);assert.ok(partial.discounts.every(record=>record.batchComplete===false && record.active===false && record.status==='creating'));
  await assert.rejects(f.service.checkout(user,{requestId:randomUUID(),promotionCode:first.discounts[0].code}),errorCode('PROMOTION_UNAVAILABLE'));
  await assert.rejects(f.service.adminCreate(owner,{...input,percentOff:25}),errorCode('REQUEST_ID_REUSED'));
  const done=await f.service.adminCreate(owner,input);assert.equal(done.complete,true);assert.equal(done.completed,10);
  assert.ok((await f.service.adminList(owner)).discounts.every(record=>record.batchComplete===true));
  await f.service.checkout(user,{requestId:randomUUID(),promotionCode:first.discounts[0].code});
  assert.equal(f.counts().sessionCount,1);
});
test('new batch creation is atomically capped at five per owner-hour while resumes do not consume slots',async()=>{
  const f=fixture(),inputs=Array.from({length:7},()=>createInput({count:10}));
  const results=await Promise.allSettled(inputs.map(input=>f.service.adminCreate(owner,input)));
  assert.equal(results.filter(item=>item.status==='fulfilled').length,5);
  assert.ok(results.filter(item=>item.status==='rejected').every(item=>item.reason.code==='DISCOUNT_CREATION_LIMIT' && item.reason.status===429));
  const index=results.findIndex(item=>item.status==='fulfilled');assert.equal((await f.service.adminCreate(owner,inputs[index])).complete,true);
  assert.equal((await f.store.list('siteBillingAdminCreationRates'))[0].count,5);
  f.advance(3600000);assert.equal((await f.service.adminCreate(owner,createInput())).complete,true);
});
test('lost checkpoint acknowledgements reuse confirmed local codes without duplicating native resources',async()=>{
  const f=fixture(),input=createInput({count:10}),original=f.store.set;let once=true;
  f.store.set=async(path,...args)=>{if(path.startsWith('siteBillingDiscountWork/')&&once){once=false;throw Error('checkpoint acknowledgement lost');}return original(path,...args);};
  await assert.rejects(f.service.adminCreate(owner,input));
  let result=await f.service.adminCreate(owner,input);while(!result.complete)result=await f.service.adminCreate(owner,input);
  assert.equal(result.completed,10);assert.equal(f.counts().promoCount,10);assert.equal(f.counts().couponCount,1);
});
test('legacy completed batches need no checkpoints or native reads and low remaining budget reports pending',async()=>{
  const f=fixture(),input=createInput();const first=await f.service.adminCreate(owner,input);
  for(const [key] of f.store.docs)if(key.startsWith('siteBillingDiscountWork/'))f.store.docs.delete(key);
  f.calls.length=0;assert.equal((await f.service.adminCreate(owner,input)).complete,true);assert.equal(f.calls.length,0);
  const g=fixture(),large=createInput({count:10});
  const pending=await withMembershipOperationBudget(()=>g.service.adminCreate(owner,large),{timeoutMs:15000});
  assert.equal(pending.complete,false);assert.equal(pending.completed,0);assert.equal(pending.total,10);assert.equal(g.counts().promoCount,0);
  assert.equal((await g.service.adminCreate(owner,large)).completed,8);
  assert.equal(first.complete,true);
});
test('owner discount pages traverse more than100 records with stable timestamp ties and bounded fresh native reads',async()=>{
  const f=fixture(),batchId='a'.repeat(32);await f.store.set(`siteBillingDiscountBatches/${batchId}`,{state:'complete'});
  const expected=[];
  for(let index=0;index<125;index++){
    const id=`promo_page_${String(index).padStart(4,'0')}`,createdAt=new Date(f.now()-(index<70?0:86400000)).toISOString();
    const record={id,batchId,code:`PAGE-${index}`,createdAt,startsAt:new Date(f.now()-86400000).toISOString(),enabled:true,livemode:false,maxRedemptions:1000};
    await f.store.set(`siteBillingDiscounts/${id}`,record);expected.push(record);
    f.promotions.set(id,{id,active:true,livemode:false,times_redeemed:index,max_redemptions:1000});
  }
  expected.sort((a,b)=>a.createdAt===b.createdAt?(a.id>b.id?-1:1):(a.createdAt>b.createdAt?-1:1));
  let active=0,peak=0,nativeReads=0;const retrieve=f.stripe.promotionCodes.retrieve;
  f.stripe.promotionCodes.retrieve=async id=>{nativeReads++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return retrieve(id);};
  const queries=[],list=f.store.list;
  f.store.list=async(collection,options)=>{if(collection==='siteBillingDiscounts')queries.push(copy(options));return list(collection,options);};
  const seen=[];let cursor=null,pages=0;
  do {
    const result=await f.service.adminList(owner,cursor?{cursor}:{});pages++;
    assert.equal(result.pageSize,6);assert.ok(result.discounts.length<=6);assert.equal(result.hasMore,Boolean(result.nextCursor));
    assert.ok(result.discounts.every(row=>row.batchComplete===true && row.timesRedeemed===Number(row.id.slice(-4))));
    assert.ok(Number.isFinite(Date.parse(result.statusAsOf)));seen.push(...result.discounts.map(row=>row.id));cursor=result.nextCursor;
    assert.ok(pages<30);
  }while(cursor);
  assert.deepEqual(seen,expected.map(row=>row.id));assert.equal(new Set(seen).size,125);assert.equal(nativeReads,125);assert.ok(peak<=3);
  assert.ok(queries.every(query=>query.limit===7 && JSON.stringify(query.orderBy)===JSON.stringify([['createdAt','desc'],['__name__','desc']])));
  assert.ok(queries.slice(1).every(query=>Array.isArray(query.startAfter) && query.startAfter.length===2));
});
test('discount continuation cursors reject tampering, another owner identity, another Stripe mode and expiry before listing',async()=>{
  const f=fixture();await f.service.adminCreate(owner,createInput({count:10}));const first=await f.service.adminList(owner),cursor=first.nextCursor;
  assert.equal(typeof cursor,'string');let reads=0;const list=f.store.list;f.store.list=async(...args)=>{reads++;return list(...args);};
  await assert.rejects(f.service.adminList(user,{cursor}),errorCode('OWNER_REQUIRED'));
  await assert.rejects(f.service.adminList(owner,{cursor:'x'.repeat(1025)}),errorCode('INVALID_DISCOUNT_CURSOR'));
  await assert.rejects(f.service.adminList(owner,{cursor:(cursor[0]==='A'?'B':'A')+cursor.slice(1)}),errorCode('INVALID_DISCOUNT_CURSOR'));
  await assert.rejects(f.service.adminList({...owner,uid:'another_owner'},{cursor}),errorCode('INVALID_DISCOUNT_CURSOR'));
  await assert.rejects(f.service.adminList(owner,{cursor,collection:'siteMemberships'}),errorCode('INVALID_DISCOUNT_CURSOR'));
  f.config.liveMode=true;await assert.rejects(f.service.adminList(owner,{cursor}),errorCode('INVALID_DISCOUNT_CURSOR'));f.config.liveMode=false;
  f.advance(1800001);await assert.rejects(f.service.adminList(owner,{cursor}),errorCode('INVALID_DISCOUNT_CURSOR'));
  assert.equal(reads,0);
});
test('Firestore adapter applies multi-field keyset ordering and a bounded startAfter without changing legacy callers',async()=>{
  const calls=[],query={orderBy(field,direction){calls.push(['orderBy',String(field),direction]);return this;},startAfter(...values){calls.push(['startAfter',...values]);return this;},
    limit(value){calls.push(['limit',value]);return this;},async get(){return {docs:[{id:'promo_adapter',data:()=>({createdAt:'2026-11-21T12:00:00.000Z'})}]};}};
  const store=createMembershipStore({collection(name){calls.push(['collection',name]);return query;}});
  const after=['2026-11-21T12:00:00.000Z','promo_previous'];
  const result=await store.list('siteBillingDiscounts',{limit:7,orderBy:[['createdAt','desc'],['__name__','desc']],startAfter:after});
  assert.deepEqual(calls,[['collection','siteBillingDiscounts'],['orderBy','createdAt','desc'],['orderBy','__name__','desc'],['startAfter',...after],['limit',7]]);
  assert.equal(result[0].id,'promo_adapter');calls.length=0;
  await store.list('siteBillingDiscounts',{limit:1,orderBy:['createdAt','desc']});assert.deepEqual(calls[1],['orderBy','createdAt','desc']);
  await assert.rejects(store.list('siteBillingDiscounts',{startAfter:after}),errorCode('INVALID_STORAGE_CURSOR'));
});
