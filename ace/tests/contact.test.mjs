import test from 'node:test';
import assert from 'node:assert/strict';
import {consultationReport,initAceContact} from '../site/assets/contact.js';
class Target {
  constructor(){this.listeners = new Map();this.dataset = {};this.attributes = new Map();this.value = '';this.textContent = '';this.disabled = false;this.hidden = false;this.checked = false;this.options = [];this.classList = {add(){},remove(){}};}
  addEventListener(name,fn){if (!this.listeners.has(name)) this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name){const event = {preventDefault(){this.defaultPrevented = true;}};for(const fn of [...(this.listeners.get(name)||[])]) fn(event);return event;}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)||null;}
  removeAttribute(name){this.attributes.delete(name);}
  add(option){this.options.push(option);}
  focus(){}
  scrollIntoView(){}
  set innerHTML(_){throw Error('Contact text must never render as HTML');}
}
const flush = async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(createReport){
  const ids=['contact-form','contact-service','contact-package','contact-submit','send-request','contact-consent','contact-status','request-preview','request-text','contact-reset','contact-name','contact-email','contact-need','contact-time','copy-request','export-request','preview-title','request-note','name-error','email-error','service-error','need-error','contact-consent-error'];const nodes=Object.fromEntries(ids.map(id=>[id,new Target()]));
  for(const [id,error] of [['contact-name','name-error'],['contact-email','email-error'],['contact-service','service-error'],['contact-need','need-error'],['contact-consent','contact-consent-error']])nodes[id].setAttribute('aria-describedby',error);
  const statusText=new Target();nodes['contact-status'].querySelector=()=>statusText;nodes['contact-form'].reset=()=>{for(const id of ['contact-name','contact-email','contact-need','contact-time','contact-service','contact-package'])nodes[id].value='';nodes['contact-consent'].checked=false;};
  const win=new Target();win.location={origin:'https://taithai.app',search:'?service=planner'};win.navigator={onLine:true};let sequence=0;win.crypto={randomUUID:()=> 'contact-request-'+String(++sequence).padStart(8,'0')};win.Option=class{constructor(label,value){this.text=label;this.value=value;}};win.confirm=()=>true;win.ACE_DATA={services:[{label:'Planner',value:'planner'}],packages:[{label:'Starter',value:'starter'}]};win.ACE_UTILS={copyText(){},exportText(){}};
  const doc={getElementById:id=>nodes[id]};const controller=initAceContact({window:win,document:doc,createReport});
  function prepare(){for(const [id,value] of [['contact-name','Example User'],['contact-email','user@example.test'],['contact-need','<img src=x onerror=alert(1)> Help organise my work safely'],['contact-time','Weekends']])nodes[id].value=value;nodes['contact-form'].fire('submit');}
  function consent(){nodes['contact-consent'].checked=true;nodes['contact-consent'].fire('change');}
  return {nodes,win,doc,controller,prepare,consent,statusText};
}
test('consultation report validates meaningful database bounds and uses the real owner-report category',()=>{
  const input={name:'Example',email:'test@example.test',service:'Planner',need:'A useful consultation request with enough detail',time:'',packageLabel:''};const report=consultationReport(input,'consultation-request-0001');assert.equal(report.app,'ACE');assert.equal(report.type,'feedback');assert.equal(report.contact,'test@example.test');assert.equal(report.reportId,'consultation-request-0001');assert.ok(Object.isFrozen(report));assert.throws(()=>consultationReport({...input,email:'bad'},report.reportId));assert.throws(()=>consultationReport({...input,need:'short'},report.reportId));assert.throws(()=>consultationReport({...input,name:'x'.repeat(101)},report.reportId));
});
test('preparing a request never sends; consent and explicit send yield only a database-confirmed receipt',async t=>{
  const writes=[];const f=fixture(async payload=>{writes.push(payload);return{id:payload.reportId};});t.after(()=>f.controller.destroy());f.prepare();assert.equal(writes.length,0);assert.equal(f.nodes['send-request'].disabled,true);assert.equal(f.nodes['request-preview'].hidden,false);assert.ok(f.nodes['request-text'].textContent.includes('<img src=x onerror=alert(1)>'));
  f.nodes['send-request'].fire('click');await flush();assert.equal(writes.length,0);f.consent();f.nodes['send-request'].fire('click');await flush();assert.equal(writes.length,1);assert.ok(f.statusText.textContent.includes(writes[0].reportId));assert.equal(f.nodes['send-request'].disabled,true);assert.equal(f.nodes['contact-name'].disabled,true);assert.equal(f.win.fire('beforeunload').defaultPrevented,undefined);f.nodes['send-request'].fire('click');await flush();assert.equal(writes.length,1);
});
test('uncertain delivery locks the original payload and retries its identical report ID without false success',async t=>{
  const writes=[];const f=fixture(async payload=>{writes.push(payload);if(writes.length===1)throw Error('network lost');return{id:payload.reportId};});t.after(()=>f.controller.destroy());f.prepare();f.consent();f.nodes['send-request'].fire('click');await flush();assert.equal(f.nodes['contact-name'].disabled,true);assert.equal(f.nodes['contact-consent'].disabled,true);assert.ok(!f.statusText.textContent.includes('ฐานข้อมูลยืนยันรับคำขอแล้ว'));assert.equal(f.win.fire('beforeunload').defaultPrevented,true);
  f.nodes['contact-need'].value='Programmatic mutation must not change the locked request';f.nodes['contact-need'].fire('input');f.nodes['send-request'].fire('click');await flush();assert.deepEqual(writes[1],writes[0]);assert.ok(f.statusText.textContent.includes(writes[0].reportId));
});
test('leaving clears private form text and a late response cannot reveal it again',async t=>{
  let finish;const f=fixture(payload=>new Promise(resolve=>{finish=()=>resolve({id:payload.reportId});}));t.after(()=>f.controller.destroy());f.prepare();f.consent();f.nodes['send-request'].fire('click');await flush();f.win.fire('pagehide');assert.equal(f.nodes['contact-email'].value,'');assert.equal(f.nodes['request-text'].textContent,'');assert.equal(f.nodes['request-preview'].hidden,true);finish();await flush();assert.equal(f.nodes['request-text'].textContent,'');assert.ok(!f.statusText.textContent.includes('ฐานข้อมูลยืนยันรับคำขอแล้ว'));
});
