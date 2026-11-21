/* Consultation requests use the parent site's real reports database. No form text is telemetry. */
export function consultationReport(values, reportId) {
  const clean = (value, min, max) => {const text = String(value || '').trim();if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw Error('INVALID_CONTACT');return text;};
  const name = clean(values.name,1,100),email = clean(values.email,3,160),service = clean(values.service,1,80),need = clean(values.need,20,2000),time = clean(values.time,0,300),packageLabel = clean(values.packageLabel,0,160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^[A-Za-z0-9_-]{12,128}$/.test(reportId)) throw Error('INVALID_CONTACT');
  return Object.freeze({reportId,app:'ACE',type:'feedback',subject:'คำขอปรึกษา ACE · ' + service,description:'ชื่อที่ใช้ติดต่อ: ' + name + '\nบริการ: ' + service + '\nแพ็กเกจที่สนใจ: ' + (packageLabel || 'ยังไม่แน่ใจ') + '\nช่วงเวลาที่สะดวก: ' + (time || 'ไม่ได้ระบุ') + '\n\nเรื่องที่อยากให้ช่วย\n' + need,contact:email,steps:'',expected:''});
}

export function initAceContact({window:win = globalThis.window,document:doc = win?.document,createReport,loadReports = () => import(new URL('assets/site-data.js',win.location.origin).href)} = {}) {
  const form = doc?.getElementById('contact-form');if (!form || form.dataset.contactInitialized) return null;form.dataset.contactInitialized = 'true';
  const data = win.ACE_DATA,utils = win.ACE_UTILS,byId = id => doc.getElementById(id),serviceSelect = byId('contact-service'),packageSelect = byId('contact-package'),submitButton = byId('contact-submit'),sendButton = byId('send-request'),consent = byId('contact-consent'),status = byId('contact-status'),preview = byId('request-preview'),requestText = byId('request-text'),resetButton = byId('contact-reset');
  const controls = ['contact-name','contact-email','contact-service','contact-package','contact-need','contact-time'].map(byId);
  let summaryText = '',prepared = null,busy = false,uncertain = false,received = false,dirty = false,disposed = false,epoch = 0;
  data.services.forEach(service => serviceSelect.add(new win.Option(service.label,service.value)));data.packages.forEach(item => packageSelect.add(new win.Option(item.label,item.value)));
  const query = new URLSearchParams(win.location.search);for (const [key,select,list] of [['service',serviceSelect,data.services],['package',packageSelect,data.packages]]) if (list.some(item => item.value === query.get(key))) select.value = query.get(key);
  function setStatus(kind,message) {status.dataset.status = kind;status.querySelector('span:last-child').textContent = message;}
  function lock(value) {for (const control of controls) control.disabled = value;submitButton.disabled = value;resetButton.disabled = busy;consent.disabled = busy || uncertain || received;sendButton.disabled = busy || received || !prepared || !consent.checked;sendButton.textContent = busy ? 'กำลังส่งคำขอ…' : uncertain ? 'ตรวจสอบและลองส่งคำขอเดิม' : 'ส่งคำขอให้เจ้าของเว็บไซต์';}
  function fieldError(input,message) {const id = (input.getAttribute('aria-describedby') || '').split(' ').find(value => value.endsWith('-error'));const error = id && byId(id);input.setAttribute('aria-invalid','true');if (error) {error.textContent = message;error.classList.add('show');}}
  function clearError(input) {input.removeAttribute('aria-invalid');const id = (input.getAttribute('aria-describedby') || '').split(' ').find(value => value.endsWith('-error'));const error = id && byId(id);if (error) {error.textContent = '';error.classList.remove('show');}}
  function validate() {
    const name = byId('contact-name'),email = byId('contact-email'),need = byId('contact-need');[name,email,serviceSelect,need].forEach(clearError);let invalid;
    const check = (control,valid,message) => {if (!valid) {fieldError(control,message);invalid ||= control;}};
    check(name,Boolean(name.value.trim()),'กรุณากรอกชื่อที่ใช้ติดต่อ');check(email,/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()),'กรุณากรอกอีเมลให้ถูกต้อง');check(serviceSelect,data.services.some(item => item.value === serviceSelect.value),'กรุณาเลือกบริการที่สนใจ');check(need,need.value.trim().length >= 20,'กรุณาเล่าเรื่องที่อยากให้ช่วยอย่างน้อย 20 ตัวอักษร');invalid?.focus();return !invalid;
  }
  function prepare(event) {
    event.preventDefault();if (busy || uncertain || received) return;
    if (!validate()) {setStatus('incomplete','ข้อมูลไม่ครบหรือไม่ถูกต้อง — โปรดตรวจช่องที่ระบุ');return;}
    try {
      prepared = consultationReport({name:byId('contact-name').value,email:byId('contact-email').value,service:data.services.find(item => item.value === serviceSelect.value).label,packageLabel:data.packages.find(item => item.value === packageSelect.value)?.label || '',need:byId('contact-need').value,time:byId('contact-time').value},win.crypto.randomUUID());
      summaryText = prepared.description + '\n\nอีเมลติดต่อ: ' + prepared.contact;requestText.textContent = summaryText;byId('preview-title').textContent = 'ตรวจสอบคำขอก่อนส่ง';byId('request-note').textContent = 'ยังไม่ได้ส่ง ข้อมูลนี้จะส่งให้เจ้าของเว็บไซต์เมื่อคุณยินยอมและกดส่งคำขอเท่านั้น';preview.hidden = false;consent.checked = false;clearError(consent);dirty = true;lock(false);setStatus('idle','เตรียมคำขอแล้ว — ตรวจสอบข้อมูลและยินยอมก่อนส่ง');preview.scrollIntoView?.({behavior:'auto',block:'nearest'});
    } catch {setStatus('incomplete','ตรวจสอบความยาวและรูปแบบข้อมูลก่อนเตรียมคำขออีกครั้ง');}
  }
  async function send() {
    if (!prepared || busy || received) return;
    if (!consent.checked) {fieldError(consent,'กรุณายินยอมให้ส่งข้อมูลก่อน');consent.focus();return;}
    if (!win.confirm(uncertain ? 'ตรวจสอบและลองส่งคำขอเดิมด้วยเลขที่เดิมหรือไม่? คำขอเดิมอาจส่งถึงแล้ว' : 'ส่งชื่อ อีเมล และรายละเอียดที่ตรวจสอบแล้วให้เจ้าของเว็บไซต์ใช่ไหม? นี่ยังไม่ใช่การยืนยันนัดหรือชำระเงิน')) return;
    const current = epoch,payload = prepared;busy = true;lock(true);setStatus('loading','กำลังรอฐานข้อมูลยืนยันรับคำขอ…');
    try {
      const save = createReport || (await loadReports()).createReport;const receipt = await save(payload);if (disposed || current !== epoch) return;
      if (receipt?.id !== payload.reportId) throw Error('UNCONFIRMED_RECEIPT');
      uncertain = false;received = true;dirty = false;byId('preview-title').textContent = 'ฐานข้อมูลรับคำขอแล้ว';byId('request-note').textContent = 'เลขที่คำขอ: ' + receipt.id + ' · เจ้าของเว็บไซต์ดูคำขอนี้ได้ในหลังบ้าน เก็บเลขที่ไว้เมื่อติดตามเรื่อง การรับคำขอไม่ใช่การยืนยันนัด ราคา หรือการชำระเงิน';summaryText = 'เลขที่คำขอ: ' + receipt.id + '\n\n' + summaryText;requestText.textContent = summaryText;setStatus('success','ฐานข้อมูลยืนยันรับคำขอแล้ว · ' + receipt.id);
    } catch (error) {
      if (disposed || current !== epoch) return;uncertain = true;byId('request-note').textContent = 'ยังยืนยันรับคำขอไม่ได้ เก็บเลขที่ ' + payload.reportId + ' ไว้ และลองคำขอเดิมด้วยเลขที่เดิม ห้ามสรุปว่าไม่ส่งถึงหรือสร้างคำขอใหม่ทันที';
      setStatus('error',win.navigator?.onLine === false ? 'ขณะนี้ออฟไลน์ ข้อมูลยังอยู่ ลองคำขอเดิมเมื่อเชื่อมต่อแล้ว' : 'ยังไม่ได้รับการยืนยันจากฐานข้อมูล ข้อมูลยังอยู่ กรุณาลองคำขอเดิม หากส่งถึงแล้วอาจได้รับแจ้งว่าเลขที่นี้ถูกใช้แล้ว ติดต่อผ่านศูนย์ช่วยเหลือพร้อมเลขที่คำขอ');
    } finally {if (!disposed && current === epoch) {busy = false;lock(uncertain || received);}}
  }
  function clear({quiet = false} = {}) {
    if (busy) return;if (!quiet && !win.confirm(uncertain ? 'คำขอเดิมอาจส่งถึงแล้ว เลขที่ ' + prepared.reportId + ' การเริ่มคำขอใหม่อาจซ้ำกัน ล้างข้อมูลเพื่อเริ่มใหม่หรือไม่?' : 'ล้างข้อมูลและเริ่มคำขอใหม่หรือไม่? คำขอที่รับแล้วจะยังอยู่ในระบบ')) return;
    epoch++;prepared = null;uncertain = false;received = false;dirty = false;summaryText = '';form.reset();requestText.textContent = '';preview.hidden = true;controls.forEach(clearError);clearError(consent);lock(false);if (!quiet) setStatus('idle','ล้างข้อมูลในหน้านี้แล้ว');
  }
  function changed() {if (busy || uncertain || received) return;dirty = true;prepared = null;summaryText = '';requestText.textContent = '';preview.hidden = true;lock(false);}
  function consentChanged() {clearError(consent);lock(uncertain || received);}
  function beforeUnload(event) {if (dirty || busy || uncertain) {event.preventDefault();event.returnValue = '';}}
  function suspend() {epoch++;busy = false;clear({quiet:true});setStatus('idle','กรอกข้อมูลเพื่อเตรียมคำขอใหม่ ข้อมูลก่อนหน้าถูกล้างจากหน้านี้แล้ว');}
  const reset = () => clear(),copy = () => utils.copyText(summaryText),download = () => utils.exportText('ace-consultation-request.txt',summaryText);
  form.addEventListener('submit',prepare);sendButton.addEventListener('click',send);resetButton.addEventListener('click',reset);consent.addEventListener('change',consentChanged);controls.forEach(control => {control.addEventListener('input',changed);control.addEventListener('change',changed);});byId('copy-request').addEventListener('click',copy);byId('export-request').addEventListener('click',download);win.addEventListener('beforeunload',beforeUnload);win.addEventListener('pagehide',suspend);lock(false);
  return {destroy(){disposed = true;epoch++;form.removeEventListener('submit',prepare);sendButton.removeEventListener('click',send);resetButton.removeEventListener('click',reset);consent.removeEventListener('change',consentChanged);controls.forEach(control => {control.removeEventListener('input',changed);control.removeEventListener('change',changed);});byId('copy-request').removeEventListener('click',copy);byId('export-request').removeEventListener('click',download);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('pagehide',suspend);delete form.dataset.contactInitialized;}};
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => initAceContact(),{once:true});else initAceContact();
}
