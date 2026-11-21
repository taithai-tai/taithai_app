import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembershipApi, initMembershipPage, checkoutDestination, memberDate, mailboxMonthlyAmount, mailboxQuantity } from '../assets/site-membership.js';
import { initMailPage, appendMailText, safeMailLink, mailboxLocalPart, normalizeMailDraft, safeReplyAddress } from '../assets/site-mail.js';
import { initMembershipAdmin, validateDiscountDraft, discountDate } from '../assets/site-admin-membership.js';

class Events {
  constructor() {this.listeners = new Map();}
  addEventListener(type,fn) {if (!this.listeners.has(type)) this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn) {this.listeners.get(type)?.delete(fn);}
  fire(type,detail = {}) {const event = {type,target:this,preventDefault(){this.defaultPrevented = true;},...detail};for (const fn of [...(this.listeners.get(type) || [])]) fn(event);return event;}
}
class Node extends Events {
  constructor(tag,doc,text) {super();this.tagName = tag.toUpperCase();this.ownerDocument = doc;this.children = [];this.parentElement = null;this.dataset = {};this.attributes = new Map();this.className = '';this.disabled = false;this.hidden = false;this.value = '';this._text = text || '';this.style = {};this.nodeType = tag === '#text' ? 3 : 1;this.classList = {add:(...names) => {this.className = [...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},remove:name => {this.className = this.className.split(' ').filter(value => value !== name).join(' ');},contains:name => this.className.split(' ').includes(name)};}
  set textContent(value) {this._text = String(value);this.children = [];}
  get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
  set innerHTML(_) {throw Error('HTML rendering is forbidden in membership/mail UI');}
  setAttribute(key,value) {this.attributes.set(key,String(value));if (key === 'id') this.id = String(value);}
  getAttribute(key) {return this.attributes.get(key) ?? null;}
  append(...nodes) {for (const node of nodes) {node.parentElement = this;this.children.push(node);}}
  replaceChildren(...nodes) {this._text = '';this.children = [];this.append(...nodes);}
  matches(selector) {return selector.split(',').some(value => {const part = value.trim();if (part.startsWith('#')) return this.id === part.slice(1);if (part.startsWith('.')) return this.classList.contains(part.slice(1));return this.tagName.toLowerCase() === part;});}
  querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []),...child.querySelectorAll(selector)]);}
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  focus() {this.ownerDocument.activeElement = this;}
  click() {if (!this.disabled) this.fire('click');}
}
const response = (data,status = 200) => ({ok:status >= 200 && status < 300,status,json:async () => data});
const flush = async () => {for (let index = 0;index < 12;index++) await Promise.resolve();await new Promise(resolve => setImmediate(resolve));};
const account = (uid = 'user-one') => ({uid,email:`${uid}@example.com`,emailVerified:true,getIdToken:async () => `test-token-${uid}`});
function fixture(id = 'membershipPanel') {
  const doc = new Events();doc.createElement = tag => new Node(tag,doc);doc.createTextNode = text => new Node('#text',doc,text);doc.documentElement = doc.createElement('html');doc.documentElement.lang = 'en';doc.body = doc.createElement('body');doc.documentElement.append(doc.body);doc.getElementById = id => doc.body.querySelector('#' + id);const root = doc.createElement('div');root.id = id;doc.body.append(root);
  const win = new Events();win.document = doc;win.navigator = {onLine:true,clipboard:{writeText:async () => {}}};win.setTimeout = setTimeout;win.clearTimeout = clearTimeout;win.crypto = {randomUUID:() => `test-request-${String(++win.sequence).padStart(8,'0')}`};win.sequence = 0;win.confirm = () => true;win.location = {assign:value => {win.destination = value;}};win.TaithaiPreferences = {get:() => ({language:'en'})};
  const storage = new Map();win.sessionStorage = {setItem:(key,value) => storage.set(key,value),getItem:key => storage.get(key) || null,removeItem:key => storage.delete(key)};
  let user = account(),callback;
  const loadAuth = async () => ({subscribeAuth(fn){callback = fn;fn(user);return () => {if (callback === fn) callback = null;};},loginWithGoogle:async () => user});
  const setUser = value => {user = value;callback?.(value);};
  return {doc,win,root,storage,loadAuth,setUser,buttons:() => root.querySelectorAll('button'),button:text => root.querySelectorAll('button').find(node => node.textContent === text)};
}
const multiBoxes = () => [{id:'box-a',address:'first@taithai.app',status:'active',canSend:true,canManageMessages:true},{id:'box-b',address:'second@taithai.app',status:'active',canSend:true,canManageMessages:true}];
const multiStatus = (patch = {}) => ({ready:true,mailReady:true,quantity:2,mailboxCapacity:2,mailboxUsed:2,membership:{active:true,paid:true,status:'active'},canSend:true,canManageMessages:true,canCreate:false,capabilities:{mail:true,checkout:false,portal:true},mailboxes:multiBoxes(),...patch});
async function chooseMailbox(f,id) {const select = f.doc.getElementById('mailboxSelector');select.value = id;select.fire('change');await flush();}
function fillDraft(f,text = 'Message') {f.button('Compose').click();for (const [id,value] of [['mailTo','friend@example.com'],['mailSubject','Subject'],['mailBody',text]]) {const input = f.doc.getElementById(id);input.value = value;input.fire('input');}}

test('authenticated client rechecks account before and after a request, without leaking tokens to URL', async () => {
  let current = account(), resolveToken, calls = 0;
  current.getIdToken = () => new Promise(resolve => {resolveToken = resolve;});
  const api = createMembershipApi({getUser:() => current,request:async () => {calls++;return response({ready:true});}});
  const result = api.call('status');current = account('other');resolveToken('sensitive-test-token');await assert.rejects(result,{code:'ACCOUNT_CHANGED'});assert.equal(calls,0);
  let resolveResponse;const api2 = createMembershipApi({getUser:() => current,request:(url,options) => {assert.ok(!url.includes('token'));assert.equal(options.headers.Authorization,'Bearer test-token-other');assert.equal(options.cache,'no-store');return new Promise(resolve => {resolveResponse = resolve;});}});
  const second = api2.call('status');await flush();current = account('third');resolveResponse(response({mailboxes:[{address:'private@taithai.app'}]}));await assert.rejects(second,{code:'ACCOUNT_CHANGED'});api.abort();api2.abort();
});

test('client aborts pending requests and accepts only trusted Stripe destinations', async () => {
  const api = createMembershipApi({getUser:() => account(),request:(_url,options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort',() => reject(Object.assign(Error('aborted'),{name:'AbortError'}))))});
  const work = api.call('status');await flush();api.abort();await assert.rejects(work,{code:'REQUEST_TIMEOUT'});
  assert.ok(checkoutDestination('https://checkout.stripe.com/c/pay/test'));
  assert.ok(checkoutDestination('https://billing.stripe.com/p/session/test'));
  for (const url of ['javascript:alert(1)','http://checkout.stripe.com/pay','https://checkout.stripe.com.evil.test/pay','https://user:secret@checkout.stripe.com/pay','https://evil.test']) assert.equal(checkoutDestination(url),'');
});

test('heavy writes get the server delivery budget and coupon dates use Thailand time explicitly', async () => {
  const delays = [];const api = createMembershipApi({getUser:() => account(),window:{setTimeout:(_fn,delay) => {delays.push(delay);return delays.length;},clearTimeout(){}},request:async () => response({ok:true})});
  await api.call('status');await api.call('send',{method:'POST',data:{}});assert.deepEqual(delays,[25000,55000]);
  assert.equal(discountDate('2026-12-01T09:00'),'2026-12-01T02:00:00.000Z');assert.equal(discountDate('2026-12-01T02:00:00.000Z'),'2026-12-01T02:00:00.000Z');assert.throws(() => discountDate('2026-02-30T09:00'));assert.equal(discountDate('2028-02-29T09:00'),'2028-02-29T02:00:00.000Z');assert.match(memberDate('2026-12-01T02:00:00Z','en'),/09:00/);
});

test('received markup stays text and only safe HTTP links become anchors', () => {
  const f = fixture(),body = f.doc.createElement('div');
  appendMailText(body,'<img src=x onerror=alert(1)> javascript:alert(1) https://example.com/docs https://user:secret@evil.test/',f.doc);
  assert.ok(body.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(body.querySelectorAll('img').length,0);
  const links = body.querySelectorAll('a');assert.equal(links.length,1);assert.equal(links[0].href,'https://example.com/docs');assert.equal(links[0].rel,'noopener noreferrer');assert.equal(links[0].referrerPolicy,'no-referrer');
  assert.equal(safeMailLink('data:text/html,<script>alert(1)</script>'),'');assert.equal(safeMailLink('javascript:alert(1)'),'');
  assert.equal(safeReplyAddress('reply@example.com'),'reply@example.com');assert.equal(safeReplyAddress('Example ‹reply@example.com›'),'');assert.equal(safeReplyAddress('reply@example.com\r\nBcc: evil@example.com'),'');
});

test('verification links exclude surrounding wrappers while signed queries and OTP digits stay exact', () => {
  const f = fixture(),body = f.doc.createElement('div');
  const text = 'Code: 001234\n[https://verify.example/activate?Token=Ab%2F%3D&state=XyZ%29].\n(HTTPS://verify.example/confirm?state=Keep!).\nRead https://example.org/a_(b).\nhttps://verify.example/?token=Keep!.';
  appendMailText(body,text,f.doc);
  assert.equal(body.textContent,text);
  assert.deepEqual(body.querySelectorAll('a').map(link => link.href),[
    'https://verify.example/activate?Token=Ab%2F%3D&state=XyZ%29',
    'https://verify.example/confirm?state=Keep!',
    'https://example.org/a_(b)',
    'https://verify.example/?token=Keep!.'
  ]);
});

test('mailbox, message and discount validation match meaningful service limits', () => {
  assert.equal(mailboxLocalPart(' My.Name '),'my.name');for (const value of ['a','ab','a..b','a@other.com','a'.repeat(31),'../secrets']) assert.throws(() => mailboxLocalPart(value));
  assert.deepEqual(normalizeMailDraft({to:'one@example.com; two@example.com',subject:'Hello',text:'Message'}),{to:'one@example.com, two@example.com',subject:'Hello',text:'Message'});
  for (const value of [{to:'victim@example.com\r\nBcc: evil@example.com',subject:'A',text:'B'},{to:'x@example.com',subject:'A\nB',text:'C'},{to:'x@example.com',subject:'A'.repeat(201),text:'B'},{to:'x@example.com',subject:'A',text:'B'.repeat(20001)}]) assert.throws(() => normalizeMailDraft(value));
  assert.equal(validateDiscountDraft({percentOff:'25',count:'2',maxRedemptions:'3',duration:'repeating',durationInMonths:'3'}).durationInMonths,3);
  assert.throws(() => validateDiscountDraft({percentOff:101,count:1}));assert.throws(() => validateDiscountDraft({percentOff:10,count:1,duration:'repeating',durationInMonths:0}));assert.throws(() => validateDiscountDraft({percentOff:10,count:1,startsAt:'2026-12-10T12:00',expiresAt:'2026-12-09T12:00'}));
});

test('unconfigured membership blocks checkout and live auth changes remove previous account state', async () => {
  const f = fixture();const actions = [];
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request:async url => {const action = new URL(url,'https://taithai.app').searchParams.get('action');actions.push(action);return response({ready:false,membership:{status:'none',active:false},mailboxes:[]});}});await flush();
  const checkout = f.button('Subscribe');assert.ok(checkout);assert.equal(checkout.disabled,true);f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(actions,['status']);
  f.setUser(account('second-account'));await flush();assert.ok(f.root.textContent.includes('second-account@example.com'));assert.ok(!f.root.textContent.includes('user-one@example.com'));
  f.setUser(null);await flush();assert.ok(f.button('Sign in with Google'));assert.ok(!f.root.textContent.includes('second-account@example.com'));controller.destroy();
});

test('discount administration does not request or expose owner data for another account', async () => {
  const f = fixture('adminMemberPanel');let requests = 0;
  const controller = initMembershipAdmin(f.root,{getUser:() => account(),window:f.win,document:f.doc,request:async () => {requests++;return response({discounts:[{code:'PRIVATE'}]});}});await flush();
  assert.equal(requests,0);assert.ok(!f.root.textContent.includes('PRIVATE'));assert.ok(f.root.textContent.includes('Only the website owner'));controller.destroy();
});

test('pricing and renewal terms remain readable before authentication is available', () => {
  const f = fixture();const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:() => new Promise(() => {})});
  assert.ok(f.root.textContent.includes('THB 99 / month'));assert.ok(f.root.textContent.includes('automatic renewal'));assert.ok(f.root.textContent.includes('20 outgoing messages'));assert.equal(f.button('Subscribe'),undefined);controller.destroy();
});

test('sandbox-active membership does not advertise a real mailbox without mail capability or an existing box', async () => {
  const f = fixture();let review = false;
  const request = async () => response({ready:true,testMode:true,membership:{active:!review,paid:!review,status:review ? 'payment_review' : 'active'},capabilities:{checkout:false,portal:false,mail:false},mailboxes:[]});
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();assert.ok(!f.root.querySelectorAll('a').some(node => node.href === '/mail/'));
  review = true;await controller.refresh();assert.ok(f.root.textContent.includes('Payment under review'));controller.destroy();
});

test('owner trial is labelled separately from paid membership and cannot start checkout', async () => {
  const f = fixture(),actions = [];f.setUser({...account(),email:'taithai5002@gmail.com'});
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request:async url => {actions.push(new URL(url,'https://taithai.app').searchParams.get('action'));return response({ready:false,mailReady:true,ownerTrial:true,membership:{active:false,paid:false,status:'none'},capabilities:{checkout:false,portal:false,mail:true},mailboxes:[]});}});await flush();
  assert.ok(f.root.textContent.includes('Owner email trial'));assert.ok(f.root.textContent.includes('This trial is not a monthly subscription'));assert.ok(f.root.textContent.includes('No membership yet'));assert.equal(f.button('Subscribe').disabled,true);f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(actions,['status']);controller.destroy();
});

test('server-authorized owner trial can create and send with live sales off, while unready trial stays blocked', async t => {
  const f = fixture('mailPanel'),writes = [];f.setUser({...account(),email:'taithai5002@gmail.com'});let created = false,mailReady = true;
  const request = async (url,options) => {
    const action = new URL(url,'https://taithai.app').searchParams.get('action');
    if (action === 'status') return response({ready:false,mailReady,ownerTrial:true,membership:{active:false,paid:false,status:'none'},canCreate:!created,canSend:created,canManageMessages:created,capabilities:{checkout:false,portal:false,mail:true},mailboxes:created ? [{id:'user-one',address:'trialmail@taithai.app'}] : []});
    if (action === 'mailbox-create') {writes.push({action,data:JSON.parse(options.body)});created = true;return response({ok:true});}
    if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});
    if (action === 'messages') return response({messages:[]});
    if (action === 'send') {writes.push({action,data:JSON.parse(options.body)});return response({status:'sent',sentCopySaved:true});}
    throw Error(action);
  };
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();assert.equal(f.button('Add email').disabled,false);const name = f.doc.getElementById('mailboxName');name.value = 'trialmail';name.fire('input');f.root.querySelector('form').fire('submit');await flush();await flush();assert.equal(f.button('Compose').disabled,false);f.button('Compose').click();
  for (const [id,value] of [['mailTo','friend@example.com'],['mailSubject','Trial test'],['mailBody','Owner trial message']]) {const input = f.doc.getElementById(id);input.value = value;input.fire('input');}
  f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(writes.map(item => item.action),['mailbox-create','send']);assert.ok(f.root.textContent.includes('Owner email trial'));
  mailReady = false;await controller.refresh();await flush();assert.equal(f.button('Compose').disabled,true);assert.ok(f.root.textContent.includes('This account cannot currently send new email'));
});

test('scheduled discounts remain disableable and owner configuration uses friendly names', async () => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'},writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'admin-status') return response({checks:{database:true,payments:true,mail:false}});if (action === 'admin-discounts') return response({ready:true,discounts:[{id:'promo_scheduled',code:'LATER',percentOff:25,enabled:true,active:false,activationPending:true,status:'scheduled',maxRedemptions:2}]});if (action === 'admin-discount-disable') {writes.push(JSON.parse(options.body));return response({ok:true});}throw Error(action);};
  const controller = initMembershipAdmin(f.root,{getUser:() => owner,window:f.win,document:f.doc,request});await flush();assert.ok(f.root.textContent.includes('Scheduled'));assert.ok(f.root.textContent.includes('Membership database'));assert.ok(f.root.textContent.includes('Email service'));assert.equal(f.button('Disable code').disabled,false);f.button('Disable code').click();await flush();assert.deepEqual(writes,[{id:'promo_scheduled'}]);assert.equal(f.button('Disable code'),undefined);controller.destroy();
});

test('owner risk records are plain text and expose no refund or cancellation action', async () => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'};
  const request = async url => new URL(url,'https://taithai.app').searchParams.get('action') === 'admin-status' ? response({checks:{database:true}}) : response({ready:false,discounts:[],riskEvents:[{id:'risk-one',uid:'customer',type:'refund',status:'<img src=x onerror=alert(1)>',blocked:true,chargeId:'ch_reference'}]});
  const controller = initMembershipAdmin(f.root,{getUser:() => owner,window:f.win,document:f.doc,request});await flush();assert.ok(f.root.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(f.root.querySelectorAll('img').length,0);assert.ok(f.root.textContent.includes('ch_reference'));assert.ok(!f.buttons().some(button => /refund|cancel subscription/i.test(button.textContent)));const dashboard = f.root.querySelectorAll('a').find(link => link.href === 'https://dashboard.stripe.com/');assert.equal(dashboard.rel,'noopener noreferrer');controller.destroy();
});

test('uncertain discount batches survive refresh and reload; rate-limited retries keep the original payload', async () => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'},writes = [];
  const request = async (url,options) => {
    const action = new URL(url,'https://taithai.app').searchParams.get('action');
    if (action === 'admin-status') return response({checks:{database:true,payments:true,mail:true}});
    if (action === 'admin-discounts') return response({ready:true,discounts:[]});
    if (action === 'admin-discount-create') {writes.push(JSON.parse(options.body));return writes.length === 1 ? response({error:{code:'PAYMENT_UNAVAILABLE'}},503) : writes.length === 2 ? response({error:{code:'RATE_LIMITED'}},429) : response({complete:true,state:'complete',completed:1,total:1,discounts:[]});}
    throw Error(action);
  };
  const options = {getUser:() => owner,window:f.win,document:f.doc,request};let controller = initMembershipAdmin(f.root,options);await flush();
  f.root.querySelector('form').fire('submit');await flush();assert.equal(writes.length,1);assert.equal(controller.dirty(),true);assert.equal(f.doc.getElementById('discount-percentOff').disabled,true);assert.equal(f.win.fire('beforeunload').defaultPrevented,true);
  f.button('Refresh').click();await flush();assert.equal(f.doc.getElementById('discount-percentOff').disabled,true,'refresh does not discard an unconfirmed batch');
  controller.destroy();controller = initMembershipAdmin(f.root,options);await flush();assert.equal(writes.length,1,'reload never auto-creates');assert.equal(f.doc.getElementById('discount-percentOff').disabled,true);
  f.button('Check and resume original batch').click();await flush();assert.deepEqual(writes[1],writes[0]);assert.equal(f.doc.getElementById('discount-percentOff').disabled,true,'a rate limit cannot unlock an earlier uncertain batch');
  f.button('Check and resume original batch').click();await flush();assert.deepEqual(writes[2],writes[0]);assert.equal(f.storage.size,0);assert.equal(f.doc.getElementById('discount-percentOff').disabled,false);assert.equal(controller.dirty(),false);controller.destroy();
});

test('uncertain sends keep immutable payload and request identity through retries and reload', async () => {
  const f = fixture('mailPanel'),sent = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,canCreate:false,canManageMessages:true,mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[]});if (action === 'send') {sent.push(JSON.parse(options.body));return response({status:'uncertain'});}throw Error('Unexpected action: ' + action);};
  let controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();f.button('Compose').click();
  for (const [id,value] of [['mailTo','friend@example.com'],['mailSubject','Original subject'],['mailBody','Original body']]) {const input = f.doc.getElementById(id);input.value = value;input.fire('input');}
  f.root.querySelector('form').fire('submit');await flush();assert.equal(sent.length,1);assert.equal(f.doc.getElementById('mailBody').disabled,true);assert.ok(!f.root.textContent.includes('The server accepted this email for sending.'));
  f.root.querySelector('form').fire('submit');await flush();assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.ok(f.storage.size > 0);
  controller.destroy();controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();assert.equal(sent.length,2,'reload never auto-sends');assert.equal(f.doc.getElementById('mailBody').value,'Original body');assert.equal(f.doc.getElementById('mailBody').disabled,true);
  f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(sent[2],sent[0]);f.setUser(account('other-account'));await flush();assert.ok(!f.root.textContent.includes('Original body'));assert.equal(f.doc.getElementById('mailBody'),null);controller.destroy();
});

test('an uncertain send cannot lose its identity when retry is rate-limited before receipt lookup', async () => {
  const f = fixture('mailPanel'),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[]});if (action === 'send') {writes.push(JSON.parse(options.body));return writes.length === 1 ? response({status:'uncertain'}) : response({error:{code:'MAIL_RATE_LIMITED'}},429);}throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();f.button('Compose').click();
  for (const [id,value] of [['mailTo','friend@example.com'],['mailSubject','Subject'],['mailBody','Message']]) {const input = f.doc.getElementById(id);input.value = value;input.fire('input');}
  f.root.querySelector('form').fire('submit');await flush();f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(writes[1],writes[0]);assert.equal(f.doc.getElementById('mailBody').disabled,true);assert.ok(f.storage.size > 0);controller.destroy();
});

test('an existing send receipt remains checkable after membership expiry and a provider outage', async () => {
  const f = fixture('mailPanel'),original = {requestId:'original-request-0001',payload:{mailbox:'user-one',to:'friend@example.com',subject:'Original',text:'Original message'}},writes = [];
  f.storage.set('taithai.mail.pending.v1:user-one',JSON.stringify(original));
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:false,membership:{active:false,paid:false},capabilities:{mail:false},canSend:false,mailboxes:[]});if (action === 'send') {writes.push(JSON.parse(options.body));return response({status:'sent',sentCopySaved:true});}throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();assert.equal(f.button('Check original send result').disabled,false);f.root.querySelector('form').fire('submit');await flush();assert.deepEqual(writes,[{...original.payload,requestId:original.requestId}]);assert.equal(f.storage.size,0);assert.ok(f.root.textContent.includes('The server accepted this email'));controller.destroy();
});

test('provisioning recovery checks the reserved name with the same identity and never opens an unready inbox', async () => {
  const f = fixture('mailPanel'),attempts = [],actions = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');actions.push(action);if (action === 'status') return response({ready:true,membership:{active:true,paid:true},mailboxes:[],mailbox:{id:'user-one',localPart:'reserved-name',address:'reserved-name@taithai.app',status:'provisioning'},canCreate:false,canRetryProvisioning:true});if (action === 'mailbox-create') {attempts.push(JSON.parse(options.body));return response({error:{code:'MAILBOX_PROVISIONING_UNCERTAIN'}},503);}throw Error('Unready mailbox must not open: ' + action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();
  assert.ok(f.root.textContent.includes('reserved-name@taithai.app'));assert.equal(f.button('Compose'),undefined);assert.equal(f.doc.getElementById('mailboxName'),null);
  f.button('Check original mailbox creation').click();await flush();await flush();f.button('Check original mailbox creation').click();await flush();await flush();
  assert.equal(attempts.length,2);assert.equal(attempts[0].localPart,'reserved-name');assert.deepEqual(attempts[0],attempts[1]);assert.ok(!actions.includes('folders'));controller.destroy();
});

test('inactive membership keeps message management while disabling outgoing mail', async () => {
  const f = fixture('mailPanel'),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:false,paid:true},canSend:false,canManageMessages:true,mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[{id:'message-one',from:'friend@example.com',subject:'Hello',date:'2026-12-01T10:00:00Z',unread:true}]});if (action === 'message') return response({message:{id:'message-one',from:'friend@example.com',subject:'Hello',text:'Private text',unread:true}});if (action === 'message-flags') {writes.push(JSON.parse(options.body));return response({ok:true});}throw Error('Unexpected action: ' + action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();
  assert.equal(f.button('Compose').disabled,true);f.root.querySelector('.mail-message').click();await flush();assert.equal(f.button('Reply').disabled,true);assert.equal(f.button('Mark as read').disabled,false);assert.equal(f.button('Move to Trash').disabled,false);
  f.button('Mark as read').click();await flush();assert.equal(writes[0].read,true);f.button('Move to Trash').click();await flush();assert.equal(writes[1].trash,true);controller.destroy();
});

test('reply uses the validated envelope address instead of a hostile display name', async () => {
  const f = fixture('mailPanel');
  const request = async url => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[{id:'original',from:'Name ‹decoy@example.com› ‹real@example.org›',subject:'Hello'}]});if (action === 'message') return response({message:{id:'original',from:'Name ‹decoy@example.com› ‹real@example.org›',replyToAddress:'real@example.org',subject:'Hello',text:'Message'}});throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();f.root.querySelector('.mail-message').click();await flush();assert.equal(f.button('Reply').disabled,false);f.button('Reply').click();assert.equal(f.doc.getElementById('mailTo').value,'real@example.org');controller.destroy();
});

test('partial SMTP acceptance and failed Sent copies are disclosed without retrying accepted mail', async () => {
  const f = fixture('mailPanel');let sent = 0;
  const request = async url => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[]});if (action === 'send') {sent++;return response({status:'sent',partial:true,rejected:['rejected@example.com'],sentCopySaved:false});}throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();f.button('Compose').click();
  for (const [id,value] of [['mailTo','accepted@example.com, rejected@example.com'],['mailSubject','Subject'],['mailBody','Message']]) {const input = f.doc.getElementById(id);input.value = value;input.fire('input');}
  f.root.querySelector('form').fire('submit');await flush();assert.equal(sent,1);assert.ok(f.root.textContent.includes('Only some recipients were accepted'));assert.ok(f.root.textContent.includes('rejected@example.com'));assert.ok(f.root.textContent.includes('Do not send it again'));assert.equal(f.storage.size,0);assert.equal(f.doc.getElementById('mailBody'),null);controller.destroy();
});

test('incoming verification mail refreshes on focus and visible polling without disturbing drafts or selected text', async () => {
  const f = fixture('mailPanel'),timers = new Map();let nextTimer = 0,listCalls = 0,arrived = false;
  f.win.setTimeout = (fn,delay) => {timers.set(++nextTimer,{fn,delay});return nextTimer;};f.win.clearTimeout = id => timers.delete(id);
  const poll = async () => {const item = [...timers].find(([,value]) => value.delay === 30000);assert.ok(item,'one bounded incoming-mail poll is scheduled');timers.delete(item[0]);item[1].fn();await flush();};
  const verification = {id:'verify-one',from:'service@example.com',subject:'Your verification code',date:'2026-12-01T02:00:00Z',unread:true};
  const request = async url => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,capabilities:{mail:true},mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox',unread:arrived ? 1 : 0}]});if (action === 'messages') {listCalls++;return response({messages:arrived ? [verification] : []});}if (action === 'message') return response({message:{...verification,text:'Your code is 001234\nhttps://example.com/verify?Token=Ab%2F'}});throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();
  const original = f.root.querySelector('.mail-workspace');await poll();assert.equal(f.root.querySelector('.mail-workspace'),original,'unchanged polling does not rebuild the reader');
  arrived = true;f.win.fire('focus');await flush();assert.ok(f.root.textContent.includes('Your verification code'));f.root.querySelector('.mail-message').click();await flush();assert.ok(f.root.querySelector('.mail-message-body').textContent.includes('001234'));
  f.doc.hidden = true;f.doc.fire('visibilitychange');const hiddenCalls = listCalls;assert.ok(![...timers.values()].some(value => value.delay === 30000));f.win.fire('focus');await flush();assert.equal(listCalls,hiddenCalls);
  f.doc.hidden = false;f.doc.fire('visibilitychange');await flush();f.button('Compose').click();const draft = f.doc.getElementById('mailBody');draft.value = 'Do not disturb this draft';draft.fire('input');const draftCalls = listCalls;await poll();f.win.fire('focus');await flush();assert.equal(listCalls,draftCalls);assert.equal(f.doc.getElementById('mailBody'),draft);assert.equal(draft.value,'Do not disturb this draft');
  f.button('Close draft').click();f.win.getSelection = () => ({isCollapsed:false});const selectionCalls = listCalls;await poll();assert.equal(listCalls,selectionCalls,'copying an OTP does not replace selected text');
  f.win.getSelection = () => ({isCollapsed:true});f.setUser(null);await flush();assert.equal(timers.size,0);const signedOutCalls = listCalls;f.win.fire('focus');await flush();assert.equal(listCalls,signedOutCalls);controller.destroy();assert.equal(timers.size,0);
});

test('a late background inbox response does not reset a newly opened compose form', async () => {
  const f = fixture('mailPanel');let folderCalls = 0,release,arrived = false;
  const request = async url => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,membership:{active:true,paid:true},canSend:true,capabilities:{mail:true},mailboxes:[{id:'user-one',address:'mine@taithai.app'}]});if (action === 'folders') {folderCalls++;if (folderCalls === 2) return new Promise(resolve => {release = () => resolve(response({folders:[{id:'INBOX',name:'Inbox'}]}));});return response({folders:[{id:'INBOX',name:'Inbox'}]});}if (action === 'messages') return response({messages:arrived ? [{id:'new-code',subject:'New OTP arrived'}] : []});throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();f.win.fire('focus');await flush();assert.ok(release);f.button('Compose').click();const input = f.doc.getElementById('mailBody');input.value = 'Keep this text';input.fire('input');arrived = true;release();await flush();assert.equal(f.doc.getElementById('mailBody'),input);assert.equal(input.value,'Keep this text');f.button('Close draft').click();assert.ok(f.root.textContent.includes('New OTP arrived'));controller.destroy();
});

test('two mailboxes display THB198 monthly and checkout submits quantity without changing entitlement', async t => {
  assert.equal(mailboxMonthlyAmount(2),19800);assert.equal(mailboxMonthlyAmount(21),207900);assert.equal(mailboxMonthlyAmount(100),990000);
  for (const value of [0,-1,1.5,'bad',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => mailboxQuantity(value));
  const f = fixture(),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,quantity:0,membership:{active:false,paid:false,status:'none'},mailboxes:[],capabilities:{checkout:true,portal:false,mail:false}});if (action === 'checkout') {writes.push(JSON.parse(options.body));return response({url:'https://checkout.stripe.com/c/pay/quantity-two'});}throw Error(action);};
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();const quantity = f.doc.getElementById('membershipQuantity');quantity.value = '2';quantity.fire('change');assert.equal(f.root.querySelector('.membership-price').textContent,'THB 198 / month');assert.ok(f.root.textContent.includes('additional email THB 99 each per month'));
  f.doc.getElementById('membershipCheckoutForm').fire('submit');await flush();assert.equal(writes[0].quantity,2);assert.equal(f.win.destination,'https://checkout.stripe.com/c/pay/quantity-two');assert.ok(!f.root.querySelectorAll('a').some(link => link.href === '/mail/'),'opening checkout does not grant a mailbox');
});

test('hosted increase keeps paid quantity until confirmation and resumes only the pending target', async t => {
  const f = fixture(),writes = [];let pending = false;
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,quantity:1,mailboxLimit:1,totalAmount:9900,unitAmount:9900,pendingQuantity:pending ? 2 : null,quantityUpdateAvailable:true,membership:{active:true,paid:true,status:'active'},mailboxes:[],capabilities:{portal:true,mail:false,checkout:false}});if (action === 'quantity-update') {writes.push(JSON.parse(options.body));pending = true;return response({url:'https://billing.stripe.com/p/session/increase',quantity:2,pending:true});}throw Error(action);};
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();assert.equal(f.doc.getElementById('membershipUpgradeQuantity').value,'2');f.doc.getElementById('membershipUpgradeForm').fire('submit');await flush();assert.equal(writes[0].quantity,2);assert.equal(f.root.querySelector('.membership-price').textContent,'THB 99 / month');await controller.refresh();assert.equal(f.root.querySelector('.membership-price').textContent,'THB 99 / month');assert.ok(f.root.textContent.includes('Current access remains limited to the confirmed quantity'));assert.equal(f.doc.getElementById('membershipUpgradeQuantity').disabled,true);assert.equal(f.doc.getElementById('membershipUpgradeQuantity').value,'2');
});

test('an unconfirmed quantity increase preserves its original payload and UUID after reload', async t => {
  const f = fixture(),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,quantity:1,quantityUpdateAvailable:true,membership:{active:true,paid:true,status:'active'},mailboxes:[],capabilities:{portal:true,mail:false,checkout:false}});if (action === 'quantity-update') {writes.push(JSON.parse(options.body));return writes.length === 1 ? response({error:{code:'PAYMENT_UNAVAILABLE'}},503) : response({url:'https://billing.stripe.com/p/session/original'});}throw Error(action);};
  let controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();f.doc.getElementById('membershipUpgradeForm').fire('submit');await flush();assert.equal(f.doc.getElementById('membershipUpgradeQuantity').disabled,true);controller.destroy();controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();assert.equal(writes.length,1);f.button('Retry original checkout').click();await flush();assert.deepEqual(writes[1],writes[0]);assert.equal(f.root.querySelector('.membership-price').textContent,'THB 99 / month');
});

test('mailbox switching aborts a stale reader and asks before discarding a draft', async t => {
  const f = fixture('mailPanel');let release,oldSignal;const reads = [];
  const request = async (url,options) => {const params = new URL(url,'https://taithai.app').searchParams,action = params.get('action'),box = params.get('mailbox');if (action === 'status') return response(multiStatus());if (action === 'folders') {reads.push(box);return response({folders:[{id:'INBOX',name:'Inbox'}]});}if (action === 'messages') return response({messages:[{id:'message-' + box,subject:'Inbox ' + box}]});if (action === 'message') {oldSignal = options.signal;return new Promise(resolve => {release = () => resolve(response({message:{id:'message-box-a',subject:'PRIVATE OLD BOX',text:'MUST NOT APPEAR'}}));});}throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();await flush();f.root.querySelector('.mail-message').click();await flush();await chooseMailbox(f,'box-b');assert.equal(oldSignal.aborted,true);release();await flush();assert.equal(f.doc.getElementById('mailboxSelector').value,'box-b');assert.ok(!f.root.textContent.includes('MUST NOT APPEAR'));assert.ok(f.root.textContent.includes('Inbox box-b'));
  fillDraft(f,'Draft in second box');const draft = f.doc.getElementById('mailBody');f.win.confirm = () => false;await chooseMailbox(f,'box-a');assert.equal(f.doc.getElementById('mailboxSelector').value,'box-b');assert.equal(f.doc.getElementById('mailBody'),draft);assert.equal(draft.value,'Draft in second box');f.win.confirm = () => true;await chooseMailbox(f,'box-a');assert.equal(f.doc.getElementById('mailBody'),null);assert.equal(reads.at(-1),'box-a');
});

test('adding another purchased mailbox selects the created mailbox and respects remaining capacity', async t => {
  const f = fixture('mailPanel'),writes = [],reads = [];let created = false;
  const request = async (url,options) => {const params = new URL(url,'https://taithai.app').searchParams,action = params.get('action');if (action === 'status') return response(multiStatus({mailboxes:created ? multiBoxes() : multiBoxes().slice(0,1),mailboxUsed:created ? 2 : 1,canCreate:!created}));if (action === 'mailbox-create') {writes.push(JSON.parse(options.body));created = true;return response({createdMailbox:multiBoxes()[1]});}if (action === 'folders') {reads.push(params.get('mailbox'));return response({folders:[{id:'INBOX',name:'Inbox'}]});}if (action === 'messages') return response({messages:[]});throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();await flush();assert.equal(f.button('Add email').disabled,false);f.button('Add email').click();const input = f.doc.getElementById('mailboxName');input.value = 'second';input.fire('input');f.doc.getElementById('mailboxCreateForm').fire('submit');await flush();await flush();assert.equal(writes[0].localPart,'second');assert.equal(f.doc.getElementById('mailboxSelector').value,'box-b');assert.equal(reads.at(-1),'box-b');assert.equal(f.button('Add email').disabled,true);assert.ok(f.root.querySelectorAll('a').some(link => link.href === '/membership/#quantity'));
});

test('pending sends retain their original mailbox after reload and switching; quota failures stay mailbox-specific', async t => {
  const f = fixture('mailPanel'),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response(multiStatus());if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[]});if (action === 'send') {const value = JSON.parse(options.body);writes.push(value);if (writes.length === 1) return response({status:'uncertain'});if (value.mailbox === 'box-b') return response({error:{code:'MAIL_DAILY_LIMIT'}},429);return response({status:'sent',sentCopySaved:true});}throw Error(action);};
  let controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();await flush();fillDraft(f,'Original in box A');f.doc.getElementById('mailComposeForm').fire('submit');await flush();controller.destroy();controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});await flush();await flush();await chooseMailbox(f,'box-b');assert.equal(f.doc.getElementById('mailBody').disabled,true);assert.ok(f.root.querySelector('.mail-compose').textContent.includes('first@taithai.app'));f.doc.getElementById('mailComposeForm').fire('submit');await flush();assert.deepEqual(writes[1],writes[0]);assert.equal(writes[1].mailbox,'box-a');
  fillDraft(f,'New in box B');f.doc.getElementById('mailComposeForm').fire('submit');await flush();assert.equal(writes[2].mailbox,'box-b');assert.ok(f.root.textContent.includes('This mailbox has reached its daily sending quota'));await chooseMailbox(f,'box-a');fillDraft(f,'Another in box A');f.doc.getElementById('mailComposeForm').fire('submit');await flush();assert.deepEqual(writes.map(value => value.mailbox),['box-a','box-a','box-b','box-a']);assert.notEqual(writes[3].requestId,writes[0].requestId);
});

test('excess mailboxes stay readable and manageable but cannot compose or create beyond paid capacity', async t => {
  const f = fixture('mailPanel'),mailboxes = multiBoxes();mailboxes[1] = {...mailboxes[1],archived:true,canSend:false};
  const request = async url => {const params = new URL(url,'https://taithai.app').searchParams,action = params.get('action');if (action === 'status') return response(multiStatus({quantity:1,mailboxCapacity:1,mailboxes}));if (action === 'folders') return response({folders:[{id:'INBOX',name:'Inbox'}]});if (action === 'messages') return response({messages:[{id:'old-' + params.get('mailbox'),subject:'Preserved mail'}]});if (action === 'message') return response({message:{id:'old-box-b',subject:'Preserved mail',text:'Still readable',unread:true}});throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();await flush();await chooseMailbox(f,'box-b');assert.equal(f.button('Compose').disabled,true);assert.equal(f.button('Add email').disabled,true);f.root.querySelector('.mail-message').click();await flush();assert.ok(f.root.textContent.includes('Still readable'));assert.equal(f.button('Mark as read').disabled,false);assert.equal(f.button('Move to Trash').disabled,false);
});


test('Hostinger creation accepts only letters, numbers and dots while other providers retain supported names', async t => {
  assert.equal(mailboxLocalPart('First.Name2','hostinger'),'first.name2');
  for (const name of ['first-name','first_name','.first','first.','first..name']) assert.throws(() => mailboxLocalPart(name,'hostinger'),{code:'INVALID_MAILBOX'});
  assert.equal(mailboxLocalPart('first-name','purelymail'),'first-name');assert.equal(mailboxLocalPart('first_name','migadu'),'first_name');
  const f = fixture('mailPanel'),writes = [];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,mailProvider:'hostinger',membership:{active:true,paid:true},canCreate:true,capabilities:{mail:true},mailboxes:[]});if (action === 'mailbox-create') {writes.push(JSON.parse(options.body));return response({ok:true});}throw Error(action);};
  const controller = initMailPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();
  assert.ok(f.root.textContent.includes('letters, numbers and dots only'));assert.ok(!f.root.textContent.includes('hyphens or underscores'));assert.ok(f.doc.getElementById('mailboxName').pattern.includes('[a-z0-9.]'));
  for (const value of ['first-name','first_name']) {const input = f.doc.getElementById('mailboxName');input.value = value;input.fire('input');f.doc.getElementById('mailboxCreateForm').fire('submit');await flush();}
  assert.equal(writes.length,0,'invalid provider-specific names never reserve a name');
  const input = f.doc.getElementById('mailboxName');input.value = 'first.name';input.fire('input');f.doc.getElementById('mailboxCreateForm').fire('submit');await flush();assert.equal(writes[0].localPart,'first.name');
});


test('membership quantity has no product cap and invalid numeric drafts cannot submit the previous valid quantity', async t => {
  const f = fixture(),writes = [];let active = false;
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'status') return response({ready:true,quantity:active ? 21 : 0,quantityUpdateAvailable:active,membership:{active,paid:active,status:active ? 'active' : 'none'},mailboxes:[],capabilities:{checkout:!active,portal:active,mail:false}});if (action === 'checkout') {writes.push(JSON.parse(options.body));return response({url:'https://checkout.stripe.com/c/pay/no-product-cap'});}throw Error(action);};
  const controller = initMembershipPage({window:f.win,document:f.doc,loadAuth:f.loadAuth,request});t.after(() => controller.destroy());await flush();
  let input = f.doc.getElementById('membershipQuantity');assert.equal(input.type,'number');assert.equal(input.min,'1');assert.equal(input.step,'1');assert.equal(input.max,undefined);
  input.value = '25';input.fire('input');assert.equal(f.root.querySelector('.membership-price').textContent,'THB 2,475 / month');assert.ok(!f.root.textContent.includes('1–20'));assert.ok(!f.root.textContent.includes('Up to 20 mailboxes'));
  input.value = '0';input.fire('input');assert.equal(f.root.querySelector('.membership-price').textContent,'—');f.doc.getElementById('membershipCheckoutForm').fire('submit');await flush();assert.equal(writes.length,0,'invalid input never falls back to the previous quantity');
  input = f.doc.getElementById('membershipQuantity');input.value = '25';input.fire('input');f.doc.getElementById('membershipCheckoutForm').fire('submit');await flush();assert.equal(writes[0].quantity,25);
  active = true;await controller.refresh();const upgrade = f.doc.getElementById('membershipUpgradeQuantity');assert.equal(upgrade.min,'22');assert.equal(upgrade.value,'22');assert.equal(upgrade.max,undefined);assert.equal(f.root.querySelector('.membership-price').textContent,'THB 2,079 / month');
});

test('partial discount batches show progress, disable copying and resume the same immutable batch after reload', async t => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'},writes = [];let completed = 0;
  const record = () => ({id:'promo-partial',code:'PARTIAL-ONE',percentOff:10,enabled:true,active:false,batchComplete:completed === 3,status:completed === 3 ? 'ready' : 'creating'});
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'admin-status') return response({checks:{database:true,payments:true}});if (action === 'admin-discounts') return response({ready:true,discounts:completed ? [record()] : [],nextCursor:null});if (action === 'admin-discount-create') {writes.push(JSON.parse(options.body));completed++;return response({batchId:'same-batch',state:completed === 3 ? 'complete' : 'creating',complete:completed === 3,completed,total:3,discounts:[record()]});}throw Error(action);};
  const options = {getUser:() => owner,window:f.win,document:f.doc,request};let controller = initMembershipAdmin(f.root,options);t.after(() => controller.destroy());await flush();const count = f.doc.getElementById('discount-count');count.value = '3';count.fire('input');f.root.querySelector('form').fire('submit');await flush();
  assert.equal(writes.length,1);assert.ok(f.root.textContent.includes('Created 1 of 3 codes'));assert.equal(f.button('Copy code').disabled,true);assert.equal(f.doc.getElementById('discount-count').disabled,true);assert.equal(controller.dirty(),true);assert.equal(f.win.fire('beforeunload').defaultPrevented,true);
  controller.destroy();controller = initMembershipAdmin(f.root,options);await flush();assert.equal(writes.length,1,'reload never creates automatically');assert.ok(f.root.textContent.includes('Created 1 of 3 codes'));assert.equal(f.doc.getElementById('discount-count').value,'3');
  const altered = f.doc.getElementById('discount-count');altered.value = '99';altered.fire('input');f.button('Resume original batch').click();await flush();assert.deepEqual(writes[1],writes[0]);assert.ok(f.root.textContent.includes('Created 2 of 3 codes'));assert.equal(f.button('Copy code').disabled,true);
  f.button('Resume original batch').click();await flush();assert.deepEqual(writes[2],writes[0]);assert.equal(f.storage.size,0);assert.equal(f.button('Copy code').disabled,false);assert.equal(controller.dirty(),false);
});

test('malformed batch receipts never release the original UUID and invalid saved progress is not displayed as fact', async t => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'},writes = [];
  const receipts = [{discounts:[]},{complete:false,state:'complete',completed:0,total:2},{complete:false,state:'creating',completed:2,total:2},{complete:false,state:'creating',completed:-1,total:2},{complete:true,state:'complete',completed:1,total:2},{complete:true,state:'complete',completed:2,total:2,discounts:[{code:'MISSING-ID'}]},{complete:true,state:'complete',completed:2,total:2,discounts:[]}];
  const request = async (url,options) => {const action = new URL(url,'https://taithai.app').searchParams.get('action');if (action === 'admin-status') return response({checks:{database:true,payments:true}});if (action === 'admin-discounts') return response({ready:true,discounts:[]});if (action === 'admin-discount-create') {writes.push(JSON.parse(options.body));return response(receipts[writes.length - 1]);}throw Error(action);};
  const options = {getUser:() => owner,window:f.win,document:f.doc,request};let controller = initMembershipAdmin(f.root,options);t.after(() => controller.destroy());await flush();const count = f.doc.getElementById('discount-count');count.value = '2';count.fire('input');f.root.querySelector('form').fire('submit');await flush();assert.equal(f.doc.getElementById('discount-count').disabled,true);assert.ok(!f.root.textContent.includes('Discount codes created'));
  const key = [...f.storage.keys()][0],saved = JSON.parse(f.storage.get(key));saved.progress = {completed:99,total:2};f.storage.set(key,JSON.stringify(saved));controller.destroy();controller = initMembershipAdmin(f.root,options);await flush();assert.ok(!f.root.textContent.includes('Created 99'));assert.equal(writes.length,1);
  for (let index = 1;index < receipts.length;index++) {f.button('Check and resume original batch').click();await flush();assert.deepEqual(writes[index],writes[0]);if (index < receipts.length - 1) {assert.equal(f.doc.getElementById('discount-count').disabled,true);assert.ok(!f.root.textContent.includes('Discount codes created'));assert.ok(f.storage.size > 0);}}
  assert.equal(f.storage.size,0);assert.equal(f.doc.getElementById('discount-count').disabled,false);
});

test('owner discount pagination deduplicates successful pages, keeps data on failure and refresh restarts the cursor', async t => {
  const f = fixture('adminMemberPanel'),owner = {...account('owner'),email:'taithai5002@gmail.com'},cursors = [];let failPage = true,reset = false;
  const code = (id,value) => ({id,code:value,enabled:false,batchComplete:true});
  const request = async url => {const query = new URL(url,'https://taithai.app').searchParams,action = query.get('action');if (action === 'admin-status') return response({checks:{database:true}});if (action !== 'admin-discounts') throw Error(action);const cursor = query.get('cursor');cursors.push(cursor);if (!cursor) return response({ready:true,discounts:[code(reset ? 'new' : 'a',reset ? 'NEW' : 'A')],nextCursor:reset ? 'cursor-new' : 'cursor-b',hasMore:true});if (cursor === 'cursor-b' && failPage) {failPage = false;return response({error:{code:'PAYMENT_UNAVAILABLE'}},503);}if (cursor === 'cursor-b') return response({ready:true,discounts:[code('a','A updated'),code('b','B')],nextCursor:'cursor-c',hasMore:true});if (cursor === 'cursor-c') return response({ready:true,discounts:[code('c','C')],nextCursor:null,hasMore:false});if (cursor === 'cursor-new') return response({ready:true,discounts:[code('next','NEXT')],nextCursor:null,hasMore:false});throw Error(cursor);};
  const controller = initMembershipAdmin(f.root,{getUser:() => owner,window:f.win,document:f.doc,request});t.after(() => controller.destroy());await flush();f.button('Load more codes').click();await flush();assert.deepEqual(f.root.querySelectorAll('code').map(item => item.textContent),['A']);assert.ok(f.root.textContent.includes('Previously loaded codes are kept'));assert.equal(f.button('Load more codes').disabled,false);
  f.button('Load more codes').click();await flush();assert.deepEqual(f.root.querySelectorAll('code').map(item => item.textContent),['A updated','B']);f.button('Load more codes').click();await flush();assert.deepEqual(f.root.querySelectorAll('code').map(item => item.textContent),['A updated','B','C']);assert.equal(f.button('Load more codes'),undefined);
  reset = true;f.button('Refresh').click();await flush();assert.deepEqual(f.root.querySelectorAll('code').map(item => item.textContent),['NEW']);f.button('Load more codes').click();await flush();assert.deepEqual(f.root.querySelectorAll('code').map(item => item.textContent),['NEW','NEXT']);assert.deepEqual(cursors,[null,'cursor-b','cursor-b','cursor-c',null,'cursor-new']);
});

test('a late owner discount page cannot reveal codes after the account changes', async t => {
  const f = fixture('adminMemberPanel');let user = {...account('owner'),email:'taithai5002@gmail.com'},release,signal;
  const request = async (url,options) => {const query = new URL(url,'https://taithai.app').searchParams;if (query.get('action') === 'admin-status') return response({checks:{database:true}});if (!query.get('cursor')) return response({ready:true,discounts:[],nextCursor:'next-owner',hasMore:true});signal = options.signal;return new Promise(resolve => {release = () => resolve(response({ready:true,discounts:[{id:'private',code:'PRIVATE LATE CODE'}],nextCursor:null,hasMore:false}));});};
  const controller = initMembershipAdmin(f.root,{getUser:() => user,window:f.win,document:f.doc,request});t.after(() => controller.destroy());await flush();f.button('Load more codes').click();await flush();user = account('nonowner');await controller.refresh();assert.equal(signal.aborted,true);release();await flush();assert.ok(!f.root.textContent.includes('PRIVATE LATE CODE'));assert.ok(f.root.textContent.includes('Only the website owner'));
});
