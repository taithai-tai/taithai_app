// Stripe-hosted payments only. No card data, redirect-provided entitlements or
// client-selected prices enter this service. Callers supply verified auth claims.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assertMembershipOperationActive } from './site-operation-budget.js';

export const STRIPE_API_VERSION = '2026-11-18.endive';
export const BILLING_PLAN = Object.freeze({ id:'mailbox-99', amount:9900, currency:'thb', interval:'month', mailboxes:1, domain:'taithai.app' });
export class BillingError extends Error {
  constructor(code, status = 400) { super(code); this.name='BillingError'; this.code=code; this.status=status; }
}
const fail = (code,status) => { throw new BillingError(code,status); };
const hash = value => createHash('sha256').update(value).digest('hex');
const idOf = value => typeof value === 'string' ? value : value?.id;
const uidOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const requestOK = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const integer = (value,min,max,code) => Number.isSafeInteger(value) && value>=min && value<=max ? value : fail(code,400);
const nonempty = (value,max,code) => typeof value === 'string' && value.trim() && value.trim().length<=max ? value.trim() : fail(code,400);
const clone = value => JSON.parse(JSON.stringify(value));

export function createBillingService({ stripe, store, config = {}, capacity, now = () => Date.now() } = {}) {
  const ownerEmail = config.ownerEmail || 'taithai5002@gmail.com';
  const quantityOK = value => Number.isSafeInteger(value) && value>=1 && Number.isSafeInteger(value*BILLING_PLAN.amount);
  function inputQuantity(value) {
    if (!Number.isSafeInteger(value) || value<1) fail('INVALID_MAILBOX_QUANTITY',400);
    if (!Number.isSafeInteger(value*BILLING_PLAN.amount)) fail('BILLING_AMOUNT_TOO_LARGE',400);
    return value;
  }
  const opts = key => ({ apiVersion:config.apiVersion || STRIPE_API_VERSION, ...(key ? {idempotencyKey:key} : {}) });
  const instant = () => new Date(now()).toISOString();
  const configured = () => Boolean(stripe && config.priceId && config.webhookSecret && store && config.stripeConfigured!==false && config.databaseReady!==false && typeof config.liveMode==='boolean');
  const quantityUpdatesReady = () => config.liveMode===false || config.quantityUpdatesVerified===true;
  function auth(user, owner = false) {
    if (!uidOK(user?.uid) || !(user.emailVerified === true || user.email_verified === true) || typeof user.email !== 'string') fail('AUTH_REQUIRED',401);
    if (owner && user.email.toLowerCase() !== ownerEmail.toLowerCase()) fail('OWNER_REQUIRED',403);
    return user.uid;
  }
  function ready() { if (!configured()) fail('BILLING_NOT_CONFIGURED',503); }
  async function remote(fn) {
    try { return await fn(); }
    catch (error) {
      if (error instanceof BillingError) throw error;
      if (error?.type==='StripeInvalidRequestError' && error.code==='amount_too_large') fail('BILLING_AMOUNT_TOO_LARGE',400);
      if (error?.type==='StripeInvalidRequestError' && error.code==='parameter_invalid_integer' && /(?:^|\[|\.)quantity(?:\]|$)/.test(error.param || '')) fail('STRIPE_QUANTITY_LIMIT',400);
      fail('PAYMENT_UNAVAILABLE',503);
    }
  }
  async function lock(key, fn) {
    if (typeof store?.withLock !== 'function') fail('BILLING_LOCK_UNAVAILABLE',503);
    return store.withLock(`billing:${key}`,fn);
  }
  function returnURL(query = '') {
    const base = new URL(config.baseUrl || 'https://taithai.app');
    if (base.protocol !== 'https:' || base.username || base.password) fail('BILLING_CONFIGURATION_INVALID',503);
    return new URL(`/membership/${query}`,base.origin).href;
  }
  function validPrice(price, purchase = false) {
    return price?.id === config.priceId && (!purchase || price.active===true) && price.currency === BILLING_PLAN.currency
      && price.unit_amount === BILLING_PLAN.amount && price.recurring?.interval === 'month'
      && (price.recurring.interval_count ?? 1) === 1 && price.type === 'recurring'
      && price.billing_scheme==='per_unit' && price.recurring.usage_type==='licensed' && !price.transform_quantity;
  }
  async function priceForCheckout() {
    ready();
    const price = await remote(() => stripe.prices.retrieve(config.priceId,{},opts()));
    if (!validPrice(price,true) || typeof price.livemode !== 'boolean') fail('PRICE_CONFIGURATION_INVALID',503);
    if (price.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',503);
    // Trust Stripe's retrieved price mode, not a browser flag or an omitted env.
    if (price.livemode && config.mailReady !== true) fail('MAIL_NOT_READY',503);
    return price;
  }
  function publicMembership(record) {
    const end = Date.parse(record?.currentPeriodEnd || '');
    const paid = record?.paid===true && quantityOK(record?.mailboxes) && record?.riskBlocked!==true && record?.livemode===config.liveMode && Number.isFinite(end) && end>now();
    const status=record?.riskBlocked===true?'payment_review':record?.status==='active'&&!paid?'payment_pending':record?.status || 'none';
    return {
      active:record?.active === true && paid, paid,
      status, currentPeriodEnd:record?.currentPeriodEnd || null,
      cancelAtPeriodEnd:record?.cancelAtPeriodEnd === true,
      ...(record?.riskBlocked===true?{riskBlocked:true}:{}),
    };
  }
  async function getStatus(user) {
    const uid = auth(user);
    const record = store && config.databaseReady!==false ? await store.get(`siteMemberships/${uid}`) : null;
    const membership = publicMembership(record);
    const quantity = membership.paid && quantityOK(record?.mailboxes) ? record.mailboxes : 0;
    let quantityUpdateAvailable = false;
    if (configured() && quantityUpdatesReady() && membership.active && quantity>0 && config.quantityPortalConfigurationId && (config.mailReady===true || config.liveMode===false)) {
      try { const selected=await quantityConfiguration(); quantityUpdateAvailable = record.cancelAtPeriodEnd!==true && (selected.maximum===null || quantity<selected.maximum); }
      catch (error) { if (!(error instanceof BillingError)) throw error; }
    }
    return { ready:configured(), mailReady:config.mailReady === true, plan:clone(BILLING_PLAN), membership,
      quantity,mailboxLimit:quantity,unitAmount:BILLING_PLAN.amount,totalAmount:quantity*BILLING_PLAN.amount,
      pendingQuantity:quantityOK(record?.pendingQuantity) && record.pendingQuantity>quantity ? record.pendingQuantity : null,
      quantityUpdateAvailable,
      checkoutAvailable:configured() && !membership.active && !['active','trialing','past_due','unpaid','paused','incomplete','unsupported_plan'].includes(record?.status) && (config.mailReady === true || config.liveMode === false),
      portalAvailable:Boolean(configured() && record?.customerId) };
  }
  async function customer(user, record) {
    if (record?.customerId) return record.customerId;
    const created = await remote(() => stripe.customers.create({email:user.email,metadata:{taithai_uid:user.uid,taithai_app:'taithai.app'}},opts(`tt-customer-${hash(user.uid)}`)));
    if (!created?.id) fail('PAYMENT_UNAVAILABLE',503);
    await store.set(`siteBillingCustomers/${created.id}`,{uid:user.uid,livemode:config.liveMode,createdAt:instant()});
    await store.set(`siteMemberships/${user.uid}`,{uid:user.uid,customerId:created.id,livemode:config.liveMode,active:false,paid:false,status:'none',updatedAt:instant()},{merge:true});
    return created.id;
  }
  async function promotion(code, price) {
    if (!code) return null;
    const normalized = nonempty(code,64,'INVALID_PROMOTION_CODE').toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(normalized)) fail('INVALID_PROMOTION_CODE',400);
    const matches = await store.list('siteBillingDiscounts',{where:[['code','==',normalized]],limit:2});
    const record = matches.find(item => item.enabled === true);
    if (!record || matches.filter(item => item.enabled === true).length!==1) fail('PROMOTION_UNAVAILABLE',400);
    return lock(`discount-batch:${record.batchId}`,async () => {
      const fresh = await store.get(`siteBillingDiscounts/${record.id}`);
      const batch = await store.get(`siteBillingDiscountBatches/${record.batchId}`);
      if (!fresh?.enabled || batch?.disabled || batch?.state!=='complete') fail('PROMOTION_UNAVAILABLE',400);
      if (Date.parse(fresh.startsAt)>now()) fail('PROMOTION_NOT_STARTED',400);
      if (fresh.expiresAt && Date.parse(fresh.expiresAt)<=now()) fail('PROMOTION_EXPIRED',400);
      let native = await remote(() => stripe.promotionCodes.retrieve(fresh.id,{},opts()));
      if (native.livemode !== price.livemode) fail('PROMOTION_UNAVAILABLE',400);
      if (fresh.activationPending && !native.active) {
        native = await remote(() => stripe.promotionCodes.update(fresh.id,{active:true},opts(`tt-promo-activate-${fresh.id}`)));
        await store.set(`siteBillingDiscounts/${fresh.id}`,{activationPending:false,active:true,updatedAt:instant()},{merge:true});
      }
      if (!native.active || (native.expires_at && native.expires_at*1000<=now())
        || (native.max_redemptions && native.times_redeemed>=native.max_redemptions)) fail('PROMOTION_UNAVAILABLE',400);
      return fresh.id;
    });
  }
  async function checkout(user, input = {}) {
    const uid = auth(user); ready();
    if (!input || typeof input!=='object' || Array.isArray(input)) fail('INVALID_CHECKOUT_INPUT',400);
    if (!requestOK(input.requestId)) fail('INVALID_REQUEST_ID',400);
    if (Object.keys(input).some(key => !['requestId','promotionCode','quantity'].includes(key))) fail('INVALID_CHECKOUT_INPUT',400);
    const quantity = inputQuantity(input.quantity===undefined?1:input.quantity);
    const code = input.promotionCode ? nonempty(input.promotionCode,64,'INVALID_PROMOTION_CODE').toUpperCase() : '';
    const price = await priceForCheckout();
    return lock(`member:${uid}`,async () => {
      const record = await store.get(`siteMemberships/${uid}`);
      if (publicMembership(record).active || ['active','trialing','past_due','unpaid','paused','incomplete','unsupported_plan'].includes(record?.status)) fail('SUBSCRIPTION_EXISTS',409);
      // A delayed/missed webhook must not sell a second subscription after the
      // first Checkout expires locally. Check Stripe's current customer state.
      if (record?.customerId) {
        const subscriptions = await remote(() => stripe.subscriptions.list({customer:record.customerId,status:'all',limit:100},opts()));
        if (subscriptions.has_more) fail('BILLING_STATE_UNAVAILABLE',503);
        if (subscriptions.data.some(subscription => !['canceled','incomplete_expired'].includes(subscription.status)
          && (subscription.metadata?.taithai_plan===BILLING_PLAN.id
            || subscription.items?.data?.some(item => idOf(item.price)===config.priceId)))) fail('SUBSCRIPTION_EXISTS',409);
      }
      const pending = await store.get(`siteBillingCheckouts/${uid}`);
      if (pending?.url) {
        const native = await remote(() => stripe.checkout.sessions.retrieve(pending.sessionId,{},opts()));
        if (!native || native.livemode!==config.liveMode || idOf(native.customer)!==record?.customerId) fail('BILLING_STATE_UNAVAILABLE',503);
        if (native.status==='open') {
          if (pending.promotionCode!==code || (pending.quantity ?? 1)!==quantity) fail('CHECKOUT_ALREADY_OPEN',409);
          if (Date.parse(pending.expiresAt)<=now()) fail('CHECKOUT_ALREADY_OPEN',409);
          return {url:pending.url,id:pending.sessionId,expiresAt:pending.expiresAt,mode:pending.mode,quantity};
        }
        if (native.status==='expired' && capacity) await capacity.releaseCheckout({uid,sessionId:pending.sessionId});
        if (native.status==='complete' && native.subscription) {
          const subscription = await remote(() => stripe.subscriptions.retrieve(idOf(native.subscription),{},opts()));
          if (!['canceled','incomplete_expired'].includes(subscription.status)) fail('SUBSCRIPTION_PENDING',409);
        }
      }
      const customerId = await customer(user,record);
      const promoId = await promotion(code,price);
      const key = `tt-checkout-${hash(`${uid}:${input.requestId}`)}`;
      const attemptPath = `siteBillingCheckoutRequests/${hash(`${uid}:${input.requestId}`)}`;
      const attempt = await store.get(attemptPath);
      if (attempt && (attempt.promotionCode!==code || (attempt.quantity ?? 1)!==quantity)) fail('REQUEST_ID_REUSED',409);
      if (attempt?.sessionId) fail('CHECKOUT_REQUEST_EXPIRED',409);
      const expiresAt = attempt?.expiresAt || new Date(now()+35*60*1000).toISOString();
      const integrationIdentifier = attempt?.integrationIdentifier || `taithai-mail-${[...randomBytes(8)].map(value=>String.fromCharCode(97+value%26)).join('')}`;
      if (Date.parse(expiresAt)<=now()+1000) fail('CHECKOUT_REQUEST_EXPIRED',409);
      const reservationId=attempt?.reservationId || (capacity ? await capacity.reserve({uid,quantity,requestId:input.requestId,kind:'checkout'}) : null);
      if (!attempt) await store.create(attemptPath,{uid,quantity,promotionCode:code,expiresAt,integrationIdentifier,reservationId,createdAt:instant()});
      const session = await remote(() => stripe.checkout.sessions.create({
        mode:'subscription',customer:customerId,client_reference_id:uid,integration_identifier:integrationIdentifier,
        line_items:[{price:config.priceId,quantity}],allow_promotion_codes:false,
        ...(promoId ? {discounts:[{promotion_code:promoId}]} : {}),
        metadata:{taithai_uid:uid,taithai_plan:BILLING_PLAN.id},
        subscription_data:{metadata:{taithai_uid:uid,taithai_plan:BILLING_PLAN.id}},
        success_url:returnURL('?checkout=success&session_id={CHECKOUT_SESSION_ID}'),cancel_url:returnURL('?checkout=cancelled'),
        expires_at:Math.floor(Date.parse(expiresAt)/1000),
      },opts(key)));
      if (!session?.url || new URL(session.url).hostname!=='checkout.stripe.com') fail('PAYMENT_UNAVAILABLE',503);
      if (capacity) await capacity.bindCheckout({uid,reservationId,sessionId:session.id});
      const result = {url:session.url,id:session.id,expiresAt:new Date(session.expires_at*1000).toISOString(),mode:price.livemode?'live':'test',quantity};
      await store.set(`siteBillingCheckouts/${uid}`,{...result,sessionId:session.id,promotionCode:code,customerId,createdAt:instant()});
      await store.set(attemptPath,{sessionId:session.id},{merge:true});
      return result;
    });
  }
  async function portal(user) {
    const uid = auth(user); ready();
    const record = await store.get(`siteMemberships/${uid}`);
    if (!record?.customerId) fail('CUSTOMER_NOT_FOUND',404);
    if (record.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',409);
    const session = await remote(() => stripe.billingPortal.sessions.create({customer:record.customerId,return_url:returnURL(),
      ...(config.portalConfigurationId ? {configuration:config.portalConfigurationId} : {})},opts()));
    if (!session?.url || new URL(session.url).hostname!=='billing.stripe.com') fail('PAYMENT_UNAVAILABLE',503);
    return {url:session.url};
  }
  async function quantityConfiguration(price) {
    if (!config.quantityPortalConfigurationId || !config.portalConfigurationId || config.quantityPortalConfigurationId===config.portalConfigurationId) fail('QUANTITY_UPDATE_NOT_CONFIGURED',503);
    const [selected,ordinary,retrievedPrice] = await remote(() => Promise.all([
      stripe.billingPortal.configurations.retrieve(config.quantityPortalConfigurationId,{},opts()),
      stripe.billingPortal.configurations.retrieve(config.portalConfigurationId,{},opts()),
      price || stripe.prices.retrieve(config.priceId,{},opts()),
    ]));
    const update = selected?.features?.subscription_update;
    price=retrievedPrice;
    if (!validPrice(price,true) || price.livemode!==config.liveMode) fail('QUANTITY_UPDATE_NOT_CONFIGURED',503);
    const product = idOf(price.product);
    const products = update?.products;
    const allowed = update?.default_allowed_updates;
    if (!selected?.active || selected.livemode!==config.liveMode || selected.is_default===true
      || !ordinary?.active || ordinary.livemode!==config.liveMode || ordinary.features?.subscription_update?.enabled!==false
      || update?.enabled!==true || update.proration_behavior!=='always_invoice'
      || (update.billing_cycle_anchor && update.billing_cycle_anchor!=='unchanged')
      || (update.schedule_at_period_end?.conditions || []).length
      || !Array.isArray(allowed) || allowed.length!==1 || allowed[0]!=='quantity'
      || !Array.isArray(products) || products.length!==1 || products[0].product!==product
      || products[0].prices?.length!==1 || products[0].prices[0]!==config.priceId
      || products[0].adjustable_quantity?.enabled!==true || products[0].adjustable_quantity.minimum!==1
      || (products[0].adjustable_quantity.maximum!=null && (!Number.isSafeInteger(products[0].adjustable_quantity.maximum)
        || products[0].adjustable_quantity.maximum<2))) fail('QUANTITY_UPDATE_NOT_CONFIGURED',503);
    return {id:selected.id,maximum:products[0].adjustable_quantity.maximum ?? null};
  }
  async function updateQuantity(user,input={}) {
    const uid=auth(user); ready();
    // Live Portal stale-session/replacement behavior must be verified in test
    // mode before an operator can enable customer quantity changes.
    if (!quantityUpdatesReady()) fail('QUANTITY_UPDATES_NOT_READY',503);
    if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['quantity','requestId'].includes(key))) fail('INVALID_QUANTITY_INPUT',400);
    if (!requestOK(input.requestId)) fail('INVALID_REQUEST_ID',400);
    const quantity=inputQuantity(input.quantity);
    const price=await priceForCheckout(), portalConfig=await quantityConfiguration(price),configuration=portalConfig.id;
    if (portalConfig.maximum!==null && quantity>portalConfig.maximum) fail('STRIPE_QUANTITY_LIMIT',400);
    return lock(`member:${uid}`,async()=>{
      const member=await store.get(`siteMemberships/${uid}`), current=publicMembership(member);
      if (!current.active || !quantityOK(member?.mailboxes) || !member.subscriptionId || member.livemode!==config.liveMode) fail('PAID_MEMBERSHIP_REQUIRED',409);
      if (quantity<=member.mailboxes) fail(quantity===member.mailboxes?'QUANTITY_UNCHANGED':'QUANTITY_DECREASE_UNSUPPORTED',409);
      const subscription=await remote(()=>stripe.subscriptions.retrieve(member.subscriptionId,{expand:['items.data.price','latest_invoice']},opts()));
      const items=subscription.items?.data || [], item=items[0];
      if (idOf(subscription.customer)!==member.customerId || subscription.livemode!==config.liveMode
        || subscription.metadata?.taithai_uid!==uid || subscription.metadata?.taithai_plan!==BILLING_PLAN.id
        || subscription.status!=='active' || subscription.cancel_at_period_end || subscription.schedule
        || subscription.pause_collection || subscription.pending_update || items.length!==1 || subscription.items?.has_more
        || !item?.id || !validPrice(item.price) || item.price.livemode!==config.liveMode || item.quantity!==member.mailboxes
        || subscription.latest_invoice?.status!=='paid') fail('QUANTITY_UPDATE_PENDING',409);
      const all=await remote(()=>stripe.subscriptions.list({customer:member.customerId,status:'all',limit:100},opts()));
      if (all.has_more || all.data.filter(sub=>!['canceled','incomplete_expired'].includes(sub.status)
        && (sub.metadata?.taithai_plan===BILLING_PLAN.id || sub.items?.data?.some(line=>idOf(line.price)===config.priceId))).length!==1) fail('BILLING_STATE_UNAVAILABLE',503);
      const path=`siteBillingQuantityRequests/${hash(`${uid}:${input.requestId}`)}`;
      const attempt=await store.get(path), pending=await store.get(`siteBillingQuantityUpdates/${uid}`);
      if (attempt && (attempt.quantity!==quantity || attempt.subscriptionId!==subscription.id || attempt.baseQuantity!==member.mailboxes)) fail('REQUEST_ID_REUSED',409);
      if (pending && pending.subscriptionId===subscription.id && pending.quantity>member.mailboxes) {
        if (pending.quantity!==quantity) fail('QUANTITY_UPDATE_PENDING',409);
        // One outstanding target per subscription. A new explicit request ID
        // can refresh its short-lived URL, but cannot change the reserved target.
        if (pending.requestId===input.requestId && pending.url) return {url:pending.url,quantity,pending:true};
      }
      if (attempt?.url) return {url:attempt.url,quantity,pending:true};
      const data={uid,subscriptionId:subscription.id,subscriptionItemId:item.id,baseQuantity:member.mailboxes,quantity,createdAt:attempt?.createdAt || instant()};
      const reservationId=attempt?.reservationId || (pending?.subscriptionId===subscription.id && pending.quantity===quantity ? pending.reservationId : null)
        || (capacity ? await capacity.reserve({uid,quantity,requestId:input.requestId,kind:'quantity-update'}) : null);
      data.reservationId=reservationId;
      if (!attempt) await store.create(path,data);
      // Claim the target durably before the external request. A lost response
      // must not let a fresh UUID start a competing quantity confirmation.
      await store.set(`siteBillingQuantityUpdates/${uid}`,{...data,requestId:input.requestId,state:'creating'});
      const session=await remote(()=>stripe.billingPortal.sessions.create({customer:member.customerId,configuration,return_url:returnURL(),
        flow_data:{type:'subscription_update_confirm',subscription_update_confirm:{subscription:subscription.id,items:[{id:item.id,price:config.priceId,quantity}]},
          after_completion:{type:'redirect',redirect:{return_url:returnURL('?quantity=review')}}}},opts(`tt-quantity-${hash(`${uid}:${input.requestId}`)}`)));
      if (session?.customer!==member.customerId || session.livemode!==config.liveMode || idOf(session.configuration)!==configuration
        || session.flow?.type!=='subscription_update_confirm' || session.flow.subscription_update_confirm?.subscription!==subscription.id) fail('PAYMENT_UNAVAILABLE',503);
      let url;
      try {url=new URL(session?.url);} catch {fail('PAYMENT_UNAVAILABLE',503);}
      if (url.protocol!=='https:' || url.hostname!=='billing.stripe.com' || url.username || url.password || url.port) fail('PAYMENT_UNAVAILABLE',503);
      const result={...data,url:url.href,sessionId:session.id || null,requestId:input.requestId,state:'open'};
      await store.set(`siteBillingQuantityUpdates/${uid}`,result);
      await store.set(path,{url:url.href,sessionId:session.id || null},{merge:true});
      await store.set(`siteMemberships/${uid}`,{pendingQuantity:quantity,updatedAt:instant()},{merge:true});
      return {url:url.href,quantity,pending:true};
    });
  }
  function dateInput(value, fallback, field) {
    if (value===undefined || value===null || value==='') return fallback;
    if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`INVALID_${field}`,400);
    return new Date(value).toISOString();
  }
  function discountInput(input) {
    if (!requestOK(input?.requestId)) fail('INVALID_REQUEST_ID',400);
    const duration = input.duration;
    if (!['once','repeating','forever'].includes(duration)) fail('INVALID_DISCOUNT_DURATION',400);
    const startsAt = dateInput(input.startsAt,null,'START_TIME');
    const expiresAt = dateInput(input.expiresAt,null,'EXPIRY_TIME');
    if (expiresAt && (Date.parse(expiresAt)<=now() || Date.parse(expiresAt)<=(startsAt?Date.parse(startsAt):now()))) fail('INVALID_EXPIRY_TIME',400);
    const prefix = input.prefix===undefined ? 'THAI' : nonempty(input.prefix,16,'INVALID_CODE_PREFIX').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(prefix)) fail('INVALID_CODE_PREFIX',400);
    return {name:nonempty(input.name ?? 'Taithai Mail discount',80,'INVALID_DISCOUNT_NAME'),percentOff:integer(input.percentOff,1,100,'INVALID_DISCOUNT_PERCENT'),
      count:integer(input.count,1,100,'INVALID_CODE_COUNT'),maxRedemptions:integer(input.maxRedemptions,1,10000,'INVALID_REDEMPTION_LIMIT'),
      startsAt,expiresAt,duration,durationInMonths:duration==='repeating'?integer(input.durationInMonths,1,36,'INVALID_DISCOUNT_MONTHS'):null,prefix};
  }
  async function eachLimit(items,fn,concurrency=4) {
    const result = new Array(items.length); let cursor=0;
    const workers = Array.from({length:Math.min(concurrency,items.length)},async () => { while (cursor<items.length) { const index=cursor++; result[index]=await fn(items[index],index); } });
    const settled = await Promise.allSettled(workers);
    const failed = settled.find(item => item.status==='rejected');
    if (failed) throw failed.reason;
    return result;
  }
  async function adminCreate(user,input) {
    const uid = auth(user,true); ready();
    const normalized = discountInput(input);
    const batchId = hash(`${uid}:${input.requestId}`).slice(0,32);
    const fingerprint = hash(JSON.stringify(normalized));
    return lock(`discount-batch:${batchId}`,async () => {
      let batch = await store.get(`siteBillingDiscountBatches/${batchId}`);
      if (batch && batch.fingerprint!==fingerprint) fail('REQUEST_ID_REUSED',409);
      if (batch?.disabled) fail('DISCOUNT_BATCH_DISABLED',409);
      if (batch && (!Array.isArray(batch.codeValues) || batch.codeValues.length!==normalized.count || new Set(batch.codeValues).size!==normalized.count)) fail('BILLING_BATCH_STATE_INVALID',503);
      const saved=await store.list('siteBillingDiscounts',{where:[['batchId','==',batchId]],limit:100});
      const records=new Map(saved.filter(record=>record.livemode===config.liveMode).map(record=>[record.code,record]));
      const progress=completed=>({batchId,state:completed===normalized.count?'complete':'creating',complete:completed===normalized.count,
        completed,total:normalized.count,discounts:(batch?.codeValues || []).map(code=>records.get(code)).filter(Boolean)
          .map(record=>({...record,batchComplete:completed===normalized.count,...(completed===normalized.count?{}:{active:false,status:'creating'})})),
        startTimeEnforcement:'application',existingSubscriptionsUnaffected:true});
      // Legacy completed batches are already acknowledged creation receipts;
      // retries must not revisit every native code or reactivate disabled ones.
      if (batch?.state==='complete' && batch.codeValues?.length===normalized.count && batch.codeValues.every(code=>records.has(code))) return progress(normalized.count);
      normalized.startsAt ||= batch?.startsAt || instant();
      const price = await remote(() => stripe.prices.retrieve(config.priceId,{},opts()));
      if (!validPrice(price,true) || !idOf(price.product)) fail('PRICE_CONFIGURATION_INVALID',503);
      if (price.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',503);
      const resumed = Boolean(batch);
      if (!batch) {
        batch = {id:batchId,...normalized,fingerprint,state:'creating',disabled:false,createdAt:instant(),createdBy:uid,
          codeValues:Array.from({length:normalized.count},() => `${normalized.prefix}-${randomBytes(6).toString('hex').toUpperCase()}`)};
        // Charge the creation limit once per immutable batch, in the same
        // transaction as its claim. Resumes consume no additional hourly slot.
        if (typeof store.transaction!=='function') fail('BILLING_TRANSACTION_UNAVAILABLE',503);
        const bucket=Math.floor(now()/3600000),ratePath=`siteBillingAdminCreationRates/${hash(`${uid}:${bucket}`)}`;
        batch=await store.transaction(async tx=>{
          const existing=await tx.get(`siteBillingDiscountBatches/${batchId}`),rate=await tx.get(ratePath);
          if (existing) {
            if (existing.fingerprint!==fingerprint) fail('REQUEST_ID_REUSED',409);
            return existing;
          }
          if ((rate?.count || 0)>=5) fail('DISCOUNT_CREATION_LIMIT',429);
          await tx.create(`siteBillingDiscountBatches/${batchId}`,batch);
          await tx.set(ratePath,{uid,bucket,count:(rate?.count || 0)+1,updatedAt:instant()});
          return batch;
        });
      }
      const work=await store.list('siteBillingDiscountWork',{where:[['batchId','==',batchId]],limit:100});
      const completed=new Set(work.filter(item=>item.complete===true && Number.isSafeInteger(item.index)
        && item.index>=0 && item.index<batch.codeValues.length
        && records.get(batch.codeValues[item.index])?.id===item.promotionId).map(item=>item.index));
      // A code confirmed by the old implementation, or just before a lost
      // checkpoint acknowledgement, is safe to skip without another Stripe RPC.
      for(let index=0;index<batch.codeValues.length;index++) {
        const record=records.get(batch.codeValues[index]);
        if (!completed.has(index) && record && (record.enabled===false || record.active===true || record.activationPending===true)) {
          await store.set(`siteBillingDiscountWork/${batchId}_${index}`,{batchId,index,promotionId:record.id,complete:true,updatedAt:instant()});
          completed.add(index);
        }
      }
      if (completed.size===normalized.count) {
        await store.set(`siteBillingDiscountBatches/${batchId}`,{state:'complete',completed:completed.size,updatedAt:instant()},{merge:true});
        return progress(completed.size);
      }
      let coupon=batch.couponId===`tt_${batchId}`?{id:batch.couponId}:null;
      if (resumed && !coupon) {
        try { coupon=await stripe.coupons.retrieve(`tt_${batchId}`,{},opts()); }
        catch (error) { if (error.code!=='resource_missing') fail('PAYMENT_UNAVAILABLE',503); }
      }
      if (!coupon) coupon = await remote(() => stripe.coupons.create({id:`tt_${batchId}`,name:normalized.name,percent_off:normalized.percentOff,
        duration:normalized.duration,...(normalized.duration==='repeating'?{duration_in_months:normalized.durationInMonths}:{}),
        applies_to:{products:[idOf(price.product)]},max_redemptions:normalized.count*normalized.maxRedemptions,
        ...(normalized.expiresAt?{redeem_by:Math.floor(Date.parse(normalized.expiresAt)/1000)}:{}),metadata:{taithai_batch:batchId}},opts(`tt-coupon-${batchId}`)));
      if (batch.couponId!==coupon.id) await store.set(`siteBillingDiscountBatches/${batchId}`,{couponId:coupon.id,updatedAt:instant()},{merge:true});
      const slice=batch.codeValues.map((code,index)=>({code,index})).filter(item=>!completed.has(item.index)).slice(0,8);
      await eachLimit(slice,async ({code,index}) => {
        // Leave time for the complete create/activate/checkpoint chain. If
        // setup consumed the budget, return acknowledged progress and resume.
        if (assertMembershipOperationActive()<(resumed?28000:20000)) return null;
        let native;
        if (resumed) {
          const prior = await remote(() => stripe.promotionCodes.list({code,limit:100},opts()));
          native = prior.data.find(item => item.metadata?.taithai_batch===batchId && item.metadata?.taithai_index===String(index));
        }
        if (!native) native = await remote(() => stripe.promotionCodes.create({promotion:{type:'coupon',coupon:coupon.id},code,active:false,
          max_redemptions:normalized.maxRedemptions,...(normalized.expiresAt?{expires_at:Math.floor(Date.parse(normalized.expiresAt)/1000)}:{}),
          metadata:{taithai_batch:batchId,taithai_index:String(index)}},opts(`tt-promo-${batchId}-${index}`)));
        const existing = await store.get(`siteBillingDiscounts/${native.id}`);
        const record = {id:native.id,batchId,code,couponId:coupon.id,...normalized,enabled:true,active:native.active,
          activationPending:Date.parse(normalized.startsAt)>now(),createdAt:batch.createdAt,livemode:price.livemode,
          timesRedeemed:native.times_redeemed || 0};
        const confirmed=existing?.enabled===false?existing:record;
        if (existing?.enabled!==false) {
          await store.set(`siteBillingDiscounts/${native.id}`,record);
          if (Date.parse(normalized.startsAt)<=now() && !native.active) {
            await remote(() => stripe.promotionCodes.update(native.id,{active:true},opts(`tt-promo-activate-${native.id}`)));
            record.active=true; record.activationPending=false;
            await store.set(`siteBillingDiscounts/${native.id}`,{active:true,activationPending:false},{merge:true});
          }
        }
        await store.set(`siteBillingDiscountWork/${batchId}_${index}`,{batchId,index,promotionId:native.id,complete:true,updatedAt:instant()});
        records.set(code,confirmed);completed.add(index);
        return confirmed;
      });
      await store.set(`siteBillingDiscountBatches/${batchId}`,{state:completed.size===normalized.count?'complete':'creating',completed:completed.size,
        couponId:coupon.id,updatedAt:instant()},{merge:true});
      return progress(completed.size);
    });
  }
  function discountCursor(uid,record) {
    if (!config.webhookSecret) fail('DISCOUNT_PAGINATION_NOT_CONFIGURED',503);
    const value=Buffer.from(JSON.stringify({v:1,kind:'discounts',uid,mode:config.liveMode,createdAt:record.createdAt,id:record.id,expiresAt:now()+1800000})).toString('base64url');
    return `${value}.${createHmac('sha256',config.webhookSecret).update(`discounts:${value}`).digest('base64url')}`;
  }
  function readDiscountCursor(uid,input) {
    if (input===undefined || input===null || input==='') return null;
    if (typeof input!=='string' || input.length>1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input) || !config.webhookSecret) fail('INVALID_DISCOUNT_CURSOR',400);
    const [encoded,signature]=input.split('.'),actual=Buffer.from(signature,'base64url');
    const expected=createHmac('sha256',config.webhookSecret).update(`discounts:${encoded}`).digest();
    if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) fail('INVALID_DISCOUNT_CURSOR',400);
    let value;try {value=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch {fail('INVALID_DISCOUNT_CURSOR',400);}
    if (value?.v!==1 || value.kind!=='discounts' || value.uid!==uid || value.mode!==config.liveMode
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt<=now() || value.expiresAt>now()+1800000
      || typeof value.id!=='string' || !/^promo_[A-Za-z0-9_]{1,180}$/.test(value.id)
      || typeof value.createdAt!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt)
      || !Number.isFinite(Date.parse(value.createdAt))) fail('INVALID_DISCOUNT_CURSOR',400);
    return [value.createdAt,value.id];
  }
  async function adminList(user,input={}) {
    const uid=auth(user,true);
    if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>key!=='cursor')) fail('INVALID_DISCOUNT_CURSOR',400);
    if (!store) fail('BILLING_NOT_CONFIGURED',503);
    const after=readDiscountCursor(uid,input.cursor),pageSize=6;
    const page = await store.list('siteBillingDiscounts',{limit:pageSize+1,orderBy:[['createdAt','desc'],['__name__','desc']],...(after?{startAfter:after}:{})});
    const records=page.slice(0,pageSize),hasMore=page.length>pageSize;
    const batches=new Map();
    await eachLimit([...new Set(records.map(record=>record.batchId))],async id=>{batches.set(id,await store.get(`siteBillingDiscountBatches/${id}`));});
    const annotated=records.map(record=>({...record,batchComplete:batches.get(record.batchId)?.state==='complete'}));
    const discounts = configured() ? await eachLimit(annotated,async record => {
      if (!record.batchComplete) return {...record,active:false,status:'creating'};
      const native = await remote(() => stripe.promotionCodes.retrieve(record.id,{},opts()));
      const scheduled = Date.parse(record.startsAt)>now();
      const expired = Boolean(record.expiresAt && Date.parse(record.expiresAt)<=now());
      const exhausted = Boolean(native.max_redemptions && native.times_redeemed>=native.max_redemptions);
      const status = !record.enabled ? 'disabled' : expired ? 'expired' : exhausted ? 'exhausted' : scheduled ? 'scheduled'
        : native.active || record.activationPending ? 'ready' : 'disabled';
      return {...record,active:status==='ready',nativeActive:native.active===true,status,
        timesRedeemed:native.times_redeemed || 0,maxRedemptions:native.max_redemptions ?? record.maxRedemptions};
    },3) : annotated.map(record=>record.batchComplete?record:{...record,active:false,status:'creating'});
    const riskEvents = await store.list('siteBillingRisks',{limit:100,orderBy:['updatedAt','desc']});
    return {ready:configured(),discounts,riskEvents,pageSize,hasMore,nextCursor:hasMore?discountCursor(uid,records.at(-1)):null,
      statusAsOf:configured()?instant():null,startTimeEnforcement:'application'};
  }
  async function adminDisable(user,input={}) {
    auth(user,true); ready();
    if (!input || typeof input!=='object' || Array.isArray(input)) fail('INVALID_DISCOUNT_TARGET',400);
    if (Boolean(input.id)===Boolean(input.batchId)) fail('INVALID_DISCOUNT_TARGET',400);
    if (input.id && (typeof input.id!=='string' || !/^promo_[A-Za-z0-9_]+$/.test(input.id))) fail('INVALID_DISCOUNT_TARGET',400);
    const target = input.id ? await store.get(`siteBillingDiscounts/${nonempty(input.id,100,'INVALID_DISCOUNT_TARGET')}`) : null;
    const batchId = input.batchId || target?.batchId;
    if (!batchId || !/^[a-f0-9]{32}$/.test(batchId)) fail('DISCOUNT_NOT_FOUND',404);
    return lock(`discount-batch:${batchId}`,async () => {
      const batch = await store.get(`siteBillingDiscountBatches/${batchId}`);
      if (!batch) fail('DISCOUNT_NOT_FOUND',404);
      const records = input.id ? [target] : await store.list('siteBillingDiscounts',{where:[['batchId','==',batchId]],limit:100});
      if (!input.id) await store.set(`siteBillingDiscountBatches/${batchId}`,{disabled:true,updatedAt:instant()},{merge:true});
      await eachLimit(records,async record => {
        await store.set(`siteBillingDiscounts/${record.id}`,{enabled:false,active:false,disablePending:true,updatedAt:instant()},{merge:true});
        await remote(() => stripe.promotionCodes.update(record.id,{active:false},opts()));
        await store.set(`siteBillingDiscounts/${record.id}`,{disablePending:false},{merge:true});
      });
      return {disabled:records.map(record => record.id),existingSubscriptionsUnaffected:true};
    });
  }
  async function recordRisk(uid,subscription,event,risk) {
    const key=hash(`${risk.type}:${risk.objectId}:${risk.invoiceId}`).slice(0,40);
    const prior=await store.get(`siteBillingRisks/${key}`);
    const value={id:key,uid,subscriptionId:subscription.id,invoiceId:risk.invoiceId,chargeId:risk.chargeId,
      paymentIntentId:risk.paymentIntentId,type:risk.type,status:risk.status,blocked:risk.blocked,
      amount:risk.amount,amountRefunded:risk.amountRefunded,currency:risk.currency,
      reviewRequired:true,livemode:config.liveMode,eventId:event.id,createdAt:prior?.createdAt || instant(),updatedAt:instant()};
    await store.set(`siteBillingRisks/${key}`,value);
    const proof=await store.get(`siteBillingInvoices/${risk.invoiceId}`);
    const risks={...proof?.risks,[key]:{type:risk.type,status:risk.status,blocked:risk.blocked}};
    await store.set(`siteBillingInvoices/${risk.invoiceId}`,{customerId:idOf(subscription.customer),subscriptionId:subscription.id,
      risks,riskBlocked:Object.values(risks).some(item=>item.blocked===true),riskReviewRequired:true},{merge:true});
    await store.set(`siteMemberships/${uid}`,{riskReviewRequired:true,riskLastType:risk.type,riskLastEventAt:instant()},{merge:true});
  }
  const cyclePath=(subscriptionId,itemId,end)=>`siteBillingCycles/${hash(`${subscriptionId}:${itemId}:${end}`)}`;
  async function invoiceQuantityProof(invoiceId,subscription,item,event) {
    // Subscription.quantity is mutable before collection. The paid invoice's
    // own immutable item, price, period and proration lines prove the quantity.
    const invoice=await remote(()=>stripe.invoices.retrieve(invoiceId,{},opts()));
    if (invoice?.status!=='paid' || invoice.livemode!==config.liveMode || idOf(invoice.customer)!==idOf(subscription.customer)
      || invoice.parent?.type!=='subscription_details' || idOf(invoice.parent.subscription_details?.subscription)!==subscription.id || invoice.currency!==BILLING_PLAN.currency) return null;
    const lines=[];let after;
    for (;;) {
      const page=await remote(()=>stripe.invoices.listLineItems(invoiceId,{limit:100,...(after?{starting_after:after}:{})},opts()));
      lines.push(...(page.data || []));
      if (lines.length>500) fail('BILLING_INVOICE_TOO_LARGE',503);
      if (!page.has_more) break;
      const cursor=page.data?.at(-1)?.id;
      if (!cursor || cursor===after) fail('BILLING_STATE_UNAVAILABLE',503);
      after=cursor;
    }
    const matches=lines.filter(line=>line.parent?.type==='subscription_item_details'
      && line.parent.subscription_item_details.subscription===subscription.id
      && line.parent.subscription_item_details.subscription_item===item.id
      && idOf(line.pricing?.price_details?.price)===config.priceId
      && idOf(line.pricing?.price_details?.product)===idOf(item.price.product)
      && line.currency===BILLING_PLAN.currency && line.livemode===config.liveMode
      && quantityOK(line.quantity) && (line.quantity_decimal==null || Number(line.quantity_decimal)===line.quantity)
      && Number.isSafeInteger(line.amount) && Number.isSafeInteger(line.period?.start) && Number.isSafeInteger(line.period?.end)
      && line.period.start<line.period.end);
    const positive=matches.filter(line=>line.amount>=0 && !line.parent.subscription_item_details.proration_details?.credited_items);
    const full=positive.filter(line=>line.parent.subscription_item_details.proration===false);
    let line,previousQuantity=null,creditInvoiceId=null,creditLineIds=[];
    if (['subscription_create','subscription_cycle'].includes(invoice.billing_reason) && full.length===1) line=full[0];
    if (invoice.billing_reason==='subscription_update' && full.length===0) {
      // Zero-total discounted prorations can contain two zero-amount lines;
      // only the larger quantity is the new debit, never the credited old one.
      const debits=positive.filter(candidate=>candidate.parent.subscription_item_details.proration===true
        && matches.some(credit=>credit.id!==candidate.id && credit.parent.subscription_item_details.proration===true
          && credit.amount<=0 && credit.quantity<candidate.quantity && credit.period.start===candidate.period.start && credit.period.end===candidate.period.end));
      if (debits.length===1) {
        line=debits[0];
        const credits=matches.filter(credit=>credit.id!==line.id && credit.parent.subscription_item_details.proration===true
          && credit.amount<=0 && credit.quantity<line.quantity && credit.period.start===line.period.start && credit.period.end===line.period.end);
        if (credits.length!==1) return null;
        previousQuantity=credits[0].quantity;
        const credited=credits[0].parent.subscription_item_details.proration_details?.credited_items;
        creditInvoiceId=idOf(credited?.invoice) || null;
        creditLineIds=Array.isArray(credited?.invoice_line_items)?credited.invoice_line_items:[];
      }
    }
    if (!line) return null;
    const proof={paid:true,customerId:idOf(subscription.customer),subscriptionId:subscription.id,subscriptionItemId:item.id,
      quantity:line.quantity,periodStart:line.period.start,periodEnd:line.period.end,lineId:line.id,
      kind:previousQuantity===null?'cycle':'proration',previousQuantity,creditInvoiceId,creditLineIds,
      paidAt:instant(),eventId:event.id,livemode:config.liveMode};
    await store.set(`siteBillingInvoices/${invoice.id}`,proof,{merge:true});
    const path=cyclePath(subscription.id,item.id,proof.periodEnd), cycle=await store.get(path);
    const invoiceIds=[...new Set([...(cycle?.invoiceIds || []),invoice.id])];
    if (invoiceIds.length>64) fail('BILLING_CYCLE_TOO_LARGE',503);
    await store.set(path,{subscriptionId:subscription.id,subscriptionItemId:item.id,periodEnd:proof.periodEnd,invoiceIds,updatedAt:instant()});
    return proof;
  }
  async function paidCycle(subscription,item,customerId,period) {
    const cycle=await store.get(cyclePath(subscription.id,item.id,period));
    const ids=cycle?.invoiceIds || [];
    if (!Array.isArray(ids) || ids.length>64) fail('BILLING_STATE_UNAVAILABLE',503);
    const proofs=await Promise.all(ids.map(async id=>({id,...await store.get(`siteBillingInvoices/${id}`)})));
    const candidates=proofs.filter(proof=>proof.paid===true && proof.customerId===customerId && proof.subscriptionId===subscription.id
      && proof.subscriptionItemId===item.id && proof.livemode===config.liveMode && proof.periodEnd===period
      && proof.periodStart<=Math.floor(now()/1000) && quantityOK(proof.quantity) && proof.quantity<=item.quantity);
    const resolved=[];
    for (let pass=0;pass<candidates.length;pass++) {
      let changed=false;
      for (const proof of candidates) {
        if (proof.riskBlocked || resolved.some(value=>value.id===proof.id)) continue;
        const base=proof.kind==='proration'?resolved.find(value=>value.quantity===proof.previousQuantity && value.periodStart<=proof.periodStart
          && (!proof.creditInvoiceId || (proof.creditInvoiceId===value.id && (!proof.creditLineIds?.length || proof.creditLineIds.includes(value.lineId))))):null;
        if (proof.kind!=='cycle' && !base) continue;
        resolved.push(proof);changed=true;
      }
      if (!changed) break;
    }
    resolved.sort((a,b)=>b.quantity-a.quantity || b.periodStart-a.periodStart);
    return {proof:resolved[0] || null,riskBlocked:!resolved.length && candidates.some(proof=>proof.riskBlocked)};
  }
  async function reconcile(uid,subscriptionId,event,risk=null) {
    return lock(`member:${uid}`,async () => {
      let subscription;
      try { subscription = await stripe.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice','items.data.price']},opts()); }
      catch (error) {
        if (event.type==='customer.subscription.deleted' && error.code==='resource_missing') subscription=event.data.object;
        else fail('PAYMENT_UNAVAILABLE',503);
      }
      if (subscription.metadata?.taithai_uid!==uid || subscription.metadata?.taithai_plan!==BILLING_PLAN.id) return {ignored:true};
      if (subscription.livemode!==config.liveMode || event.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',400);
      const member = await store.get(`siteMemberships/${uid}`);
      const customerId = idOf(subscription.customer);
      if (!member || member.customerId!==customerId) fail('BILLING_CUSTOMER_MISMATCH',409);
      if (risk && risk.invoiceCustomerId!==customerId) fail('BILLING_CUSTOMER_MISMATCH',409);
      if (risk) await recordRisk(uid,subscription,event,risk);
      if (member.subscriptionId && member.subscriptionId!==subscription.id
        && (!['canceled','incomplete_expired','none'].includes(member.status) || subscription.status!=='active')) return {ignored:true};
      const items = subscription.items?.data || [];
      let price = items[0]?.price;
      if (typeof price==='string') price=await remote(() => stripe.prices.retrieve(price,{},opts()));
      if (items.length!==1 || subscription.items?.has_more || !items[0]?.id || !quantityOK(items[0].quantity) || !validPrice(price)) {
        await store.set(`siteMemberships/${uid}`,{active:false,paid:false,status:'unsupported_plan',updatedAt:instant(),lastStripeEventId:event.id},{merge:true});
        return {active:false,paid:false};
      }
      items[0].price=price;
      if (event.livemode!==subscription.livemode || price.livemode!==subscription.livemode) fail('BILLING_MODE_MISMATCH',400);
      const invoice = event.type==='invoice.paid' ? event.data.object : null;
      if (invoice && invoice.status==='paid' && idOf(invoice.customer)===customerId) {
        await invoiceQuantityProof(invoice.id,subscription,items[0],event);
      }
      const latest = subscription.latest_invoice;
      const period = items[0]?.current_period_end ?? subscription.current_period_end;
      const periodEnd = Number.isSafeInteger(period) && period>0 ? new Date(period*1000).toISOString() : null;
      const cycle=periodEnd?await paidCycle(subscription,items[0],customerId,period):{proof:null,riskBlocked:false};
      const proof=cycle.proof, paid=Boolean(proof && periodEnd && Date.parse(periodEnd)>now());
      const active = paid && ['active','past_due'].includes(subscription.status) && Boolean(periodEnd && Date.parse(periodEnd)>now());
      const quantity=paid?proof.quantity:0;
      const pending=await store.get(`siteBillingQuantityUpdates/${uid}`);
      const requested=quantityOK(pending?.quantity) && pending.subscriptionId===subscription.id && pending.quantity>quantity ? pending.quantity
        : quantityOK(subscription.pending_update?.subscription_items?.[0]?.quantity) ? subscription.pending_update.subscription_items[0].quantity
        : items[0].quantity>quantity ? items[0].quantity:null;
      await store.set(`siteMemberships/${uid}`,{uid,active,paid,status:subscription.status,currentPeriodEnd:periodEnd,
        cancelAtPeriodEnd:subscription.cancel_at_period_end===true,customerId,subscriptionId:subscription.id,
        invoiceId:proof?.id || idOf(latest) || null,paidAt:paid?proof.paidAt:null,planId:BILLING_PLAN.id,
        riskBlocked:cycle.riskBlocked,riskInvoiceId:cycle.riskBlocked ? (risk?.invoiceId || idOf(latest) || null) : null,
        amount:BILLING_PLAN.amount,currency:BILLING_PLAN.currency,mailboxes:quantity,quantity,pendingQuantity:requested,
        totalAmount:quantity*BILLING_PLAN.amount,livemode:subscription.livemode,
        updatedAt:instant(),lastStripeEventId:event.id},{merge:true});
      if (capacity) await capacity.settle({uid});
      return {active,paid,quantity};
    });
  }
  async function riskEvent(event) {
    let object=event.data.object,type,chargeId,status,blocked;
    if (event.type==='charge.refunded') {
      type='refund';chargeId=object.id;
    } else if (event.type.startsWith('charge.dispute.')) {
      type='dispute';object=await remote(()=>stripe.disputes.retrieve(object.id,{},opts()));
      if (!object.status) fail('BILLING_RISK_DATA_UNAVAILABLE',503);
      chargeId=idOf(object.charge);status=object.status;
      blocked=!['won','prevented','warning_closed'].includes(status);
    } else {
      type='fraud_warning';object=await remote(()=>stripe.radar.earlyFraudWarnings.retrieve(object.id,{},opts()));
      chargeId=idOf(object.charge);status='owner_review_required';blocked=true;
    }
    if (!chargeId) fail('BILLING_RISK_DATA_UNAVAILABLE',503);
    const charge=await remote(()=>stripe.charges.retrieve(chargeId,{},opts()));
    if (charge.livemode!==config.liveMode || (typeof object.livemode==='boolean' && object.livemode!==config.liveMode)) fail('BILLING_MODE_MISMATCH',400);
    const amount=Number.isSafeInteger(charge.amount_captured)?charge.amount_captured:charge.amount;
    if (type==='refund') {
      blocked=charge.refunded===true || (amount>0 && charge.amount_refunded>=amount);
      status=blocked?'fully_refunded':'partially_refunded';
    }
    const paymentIntentId=idOf(charge.payment_intent) || idOf(object.payment_intent) || null;
    if (idOf(charge.payment_intent) && idOf(object.payment_intent) && idOf(charge.payment_intent)!==idOf(object.payment_intent)) fail('BILLING_RISK_DATA_UNAVAILABLE',503);
    const base={type,objectId:type==='refund'?charge.id:object.id,chargeId:charge.id,paymentIntentId,status,blocked,
      amount:Number.isSafeInteger(amount)?amount:0,amountRefunded:Number.isSafeInteger(charge.amount_refunded)?charge.amount_refunded:0,currency:charge.currency || null};
    async function unresolved(reason,invoiceId=null) {
      const key=hash(`${type}:${base.objectId}:${invoiceId || 'unresolved'}`).slice(0,40);
      await store.set(`siteBillingRisks/${key}`,{id:key,...base,invoiceId,uid:null,subscriptionId:null,reason,
        reviewRequired:true,livemode:config.liveMode,eventId:event.id,updatedAt:instant()});
    }
    if (!paymentIntentId) {await unresolved('NO_PAYMENT_INTENT');return {riskReviewRequired:true,ignored:true};}
    const invoiceIds=new Set();let after;
    for (;;) {
      const page=await remote(()=>stripe.invoicePayments.list({payment:{type:'payment_intent',payment_intent:paymentIntentId},status:'paid',limit:100,
        ...(after?{starting_after:after}:{})},opts()));
      for (const payment of page.data || []) {
        if (payment.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',400);
        if (payment.payment?.type!=='payment_intent' || idOf(payment.payment.payment_intent)!==paymentIntentId) fail('BILLING_RISK_DATA_UNAVAILABLE',503);
        if (idOf(payment.invoice)) invoiceIds.add(idOf(payment.invoice));
      }
      if (!page.has_more) break;
      const cursor=page.data?.at(-1)?.id;
      if (!cursor || cursor===after) fail('BILLING_RISK_DATA_UNAVAILABLE',503);
      after=cursor;
    }
    if (!invoiceIds.size) {await unresolved('NO_ASSOCIATED_INVOICE');return {riskReviewRequired:true,ignored:true};}
    let affected=0;
    for (const invoiceId of invoiceIds) {
      const invoice=await remote(()=>stripe.invoices.retrieve(invoiceId,{},opts()));
      if (invoice.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',400);
      const customerId=idOf(invoice.customer),subscriptionId=invoice.parent?.type==='subscription_details' ? idOf(invoice.parent.subscription_details?.subscription) : null;
      if (!subscriptionId || !customerId || (idOf(charge.customer) && idOf(charge.customer)!==customerId)) {await unresolved('NO_MATCHING_SUBSCRIPTION',invoiceId);continue;}
      const mapping=await store.get(`siteBillingCustomers/${customerId}`);
      if (!uidOK(mapping?.uid) || mapping.livemode!==config.liveMode) {await unresolved('NO_APPLICATION_CUSTOMER',invoiceId);continue;}
      await reconcile(mapping.uid,subscriptionId,event,{...base,invoiceId,invoiceCustomerId:customerId});affected++;
    }
    return {riskReviewRequired:true,affectedInvoices:affected};
  }
  async function webhook({rawBody,signature}={}) {
    ready();
    if (!(typeof rawBody==='string' || Buffer.isBuffer(rawBody)) || Buffer.byteLength(rawBody)>1024*1024 || typeof signature!=='string' || signature.length>8192) fail('INVALID_WEBHOOK',400);
    let event;
    try { event = stripe.webhooks.constructEvent(rawBody,signature,config.webhookSecret); }
    catch { fail('INVALID_WEBHOOK_SIGNATURE',400); }
    if (!event?.id || !/^evt_[A-Za-z0-9_]+$/.test(event.id) || !event.data?.object) fail('INVALID_WEBHOOK',400);
    if (event.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',400);
    const riskTypes=/^(?:charge\.refunded|charge\.dispute\.(?:created|updated|closed)|radar\.early_fraud_warning\.created)$/;
    const supported = /^(?:customer\.subscription\.(?:created|updated|deleted|paused|resumed|pending_update_applied|pending_update_expired)|invoice\.(?:paid|payment_failed|payment_action_required|voided|marked_uncollectible)|checkout\.session\.(?:completed|expired|async_payment_succeeded|async_payment_failed))$/;
    if (!supported.test(event.type) && !riskTypes.test(event.type)) return {received:true,ignored:true};
    return lock(`event:${event.id}`,async () => {
      if (await store.get(`siteBillingEvents/${event.id}`)) return {received:true,duplicate:true};
      if (riskTypes.test(event.type)) {
        // Created/closed events have different event IDs. Serialize the risk
        // resource too, so a slow earlier read cannot overwrite a newer result.
        const kind=event.type.startsWith('charge.dispute.')?'dispute':event.type==='charge.refunded'?'refund':'fraud';
        const result=await lock(`risk:${kind}:${event.data.object.id}`,()=>riskEvent(event));
        await store.set(`siteBillingEvents/${event.id}`,{type:event.type,processedAt:instant(),riskReviewRequired:true});
        return {received:true,...result};
      }
      const object = event.data.object;
      const mapping = idOf(object.customer) ? await store.get(`siteBillingCustomers/${idOf(object.customer)}`) : null;
      if (mapping && mapping.livemode!==config.liveMode) fail('BILLING_MODE_MISMATCH',400);
      if (event.type==='checkout.session.expired' && uidOK(mapping?.uid)) {
        const native=await remote(()=>stripe.checkout.sessions.retrieve(object.id,{},opts()));
        if (native?.status!=='expired' || idOf(native.customer)!==idOf(object.customer) || native.livemode!==config.liveMode) fail('BILLING_STATE_UNAVAILABLE',503);
        if (capacity) await capacity.releaseCheckout({uid:mapping.uid,sessionId:object.id});
      }
      const subscriptionId = event.type.startsWith('customer.subscription.') ? object.id
        : idOf(object.subscription) || idOf(object.parent?.subscription_details?.subscription);
      let result = {ignored:true};
      if (uidOK(mapping?.uid) && subscriptionId) result=await reconcile(mapping.uid,subscriptionId,event);
      await store.set(`siteBillingEvents/${event.id}`,{type:event.type,processedAt:instant(),ignored:result.ignored===true});
      return {received:true,...result};
    });
  }
  return {getStatus,checkout,updateQuantity,portal,adminList,adminCreate,adminDisable,webhook};
}
