/* Plain-text webmail. Received HTML is never rendered, and browser storage never
   contains mailbox credentials. Pending sends retain their idempotency identity. */
import { createMembershipApi, createMemberUi, membershipText, membershipLanguage, membershipError, membershipReady, membershipActive, membershipSetup, memberDate } from './site-membership.js';
const COPY = {
  th:{ loading:'กำลังโหลดกล่องอีเมล…',login:'เข้าสู่ระบบเพื่อเปิดอีเมล',loginText:'ใช้บัญชี Google เดียวกับที่สมัครสมาชิก Taithai',create:'ตั้งชื่ออีเมลของคุณ',createText:'เพิ่มอีเมลตามสมาชิกของคุณ เลือกชื่อที่ต้องการแล้วตรวจสอบก่อนยืนยัน',local:'ชื่อก่อน @taithai.app',localHint:'ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข จุด ขีดกลาง หรือขีดล่าง ตามเงื่อนไขของเซิร์ฟเวอร์',createButton:'เพิ่มอีเมล',createConfirm:'เพิ่มอีเมลนี้ในสมาชิกของคุณใช่ไหม',membership:'จัดการสมาชิก',noMailbox:'ยังไม่มีกล่องอีเมล สมัครสมาชิกก่อนแล้วกลับมาเลือกชื่อที่นี่',folders:'โฟลเดอร์',inbox:'กล่องขาเข้า',sent:'ส่งแล้ว',trash:'ถังขยะ',drafts:'ฉบับร่าง',junk:'จดหมายขยะ',archive:'เก็บถาวร',all:'อีเมลทั้งหมด',refresh:'รีเฟรช',compose:'เขียนอีเมล',empty:'ยังไม่มีอีเมลในโฟลเดอร์นี้',emptyDetail:'เลือกอีเมลเพื่ออ่าน',subjectEmpty:'(ไม่มีหัวข้อ)',from:'จาก',to:'ถึง',cc:'สำเนา',date:'วันที่',subject:'หัวข้อ',body:'ข้อความ',send:'ส่งอีเมล',sending:'กำลังส่ง…',reply:'ตอบกลับ',markRead:'ทำเครื่องหมายว่าอ่านแล้ว',markUnread:'ทำเครื่องหมายว่ายังไม่อ่าน',moveTrash:'ย้ายไปถังขยะ',trashConfirm:'ย้ายอีเมลนี้ไปถังขยะใช่ไหม',discard:'ปิดฉบับร่าง',discardConfirm:'ยกเลิกข้อความร่างนี้ใช่ไหม',sendConfirm:'ส่งอีเมลนี้ไปยังผู้รับที่ระบุใช่ไหม',sentOk:'เซิร์ฟเวอร์รับอีเมลเพื่อส่งแล้ว ตรวจสอบได้ที่โฟลเดอร์ส่งแล้ว',sendPending:'ยังยืนยันผลการส่งไม่ได้',sendPendingText:'ข้อความนี้ถูกล็อกไว้เพื่อป้องกันการส่งซ้ำ ตรวจสอบโฟลเดอร์ส่งแล้วก่อน หากยังไม่มี ให้ลองส่งรายการเดิมด้วยรหัสเดิม',retrySend:'ตรวจสอบและลองส่งรายการเดิม',pendingDiscard:'ล้างรายการที่รอยืนยัน',pendingDiscardConfirm:'ตรวจสอบโฟลเดอร์ส่งแล้วหรือยัง? การล้างรายการนี้ไม่ได้ยกเลิกอีเมลที่เซิร์ฟเวอร์อาจส่งไปแล้ว การเขียนส่งใหม่อาจทำให้ซ้ำ',draftHint:'ร่างอยู่ในหน้านี้เท่านั้น รายการส่งที่รอยืนยันจะเก็บไว้ในแท็บนี้เพื่อให้ลองด้วยรหัสเดิม',plain:'แสดงอีเมลเป็นข้อความธรรมดาเพื่อความปลอดภัย ไม่โหลดรูปภายนอกหรือ HTML',attachments:'ไฟล์แนบ',attachmentNote:'ขณะนี้แสดงชื่อและขนาดไฟล์แนบ การดาวน์โหลดยังไม่เปิดให้ใช้',more:'โหลดอีเมลเพิ่มเติม',back:'กลับรายการอีเมล',readOnly:'สมาชิกไม่ได้ใช้งานอยู่ คุณยังอ่านและจัดการอีเมลเดิมได้ แต่ต้องต่ออายุก่อนส่งอีเมลใหม่',busy:'กำลังดำเนินการ…',invalid:'ตรวจสอบผู้รับ หัวข้อ และข้อความก่อนส่ง',unavailable:'บริการอีเมลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',storage:'เบราว์เซอร์ไม่ให้เก็บรายการที่รอยืนยัน อย่าปิดแท็บจนกว่าจะตรวจสอบผลส่งแล้ว',changed:'บัญชีเปลี่ยนแล้ว ข้อมูลอีเมลก่อนหน้าถูกซ่อน',mailboxCreated:'สร้างกล่องอีเมลแล้ว',loadFailed:'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง' },
  en:{ loading:'Loading your mailbox…',login:'Sign in to open mail',loginText:'Use the Google account connected to your Taithai membership',create:'Choose your email address',createText:'Add email to your membership. Choose a name and review it before confirming.',local:'Name before @taithai.app',localHint:'Use lowercase English letters, numbers, dots, hyphens or underscores, subject to server validation.',createButton:'Add email',createConfirm:'Add this email to your membership?',membership:'Manage membership',noMailbox:'You do not have a mailbox yet. Subscribe, then return here to choose its name.',folders:'Folders',inbox:'Inbox',sent:'Sent',trash:'Trash',drafts:'Drafts',junk:'Junk',archive:'Archive',all:'All mail',refresh:'Refresh',compose:'Compose',empty:'No messages in this folder',emptyDetail:'Choose an email to read',subjectEmpty:'(No subject)',from:'From',to:'To',cc:'Cc',date:'Date',subject:'Subject',body:'Message',send:'Send email',sending:'Sending…',reply:'Reply',markRead:'Mark as read',markUnread:'Mark as unread',moveTrash:'Move to Trash',trashConfirm:'Move this email to Trash?',discard:'Close draft',discardConfirm:'Discard this draft?',sendConfirm:'Send this email to the listed recipient?',sentOk:'The server accepted this email for sending. Check the Sent folder.',sendPending:'Sending has not been confirmed',sendPendingText:'This message is locked to prevent duplicate sending. Check Sent first. If it is missing, retry the original request with the same identity.',retrySend:'Check and retry original send',pendingDiscard:'Clear pending request',pendingDiscardConfirm:'Have you checked Sent? Clearing this request does not cancel an email the server may already have sent. Sending a new draft could create a duplicate.',draftHint:'Drafts stay on this page. Unconfirmed sends are kept in this tab so retries use the original identity.',plain:'Emails are shown as plain text for safety. External images and HTML are not loaded.',attachments:'Attachments',attachmentNote:'Attachment names and sizes are shown. Downloads are not available yet.',more:'Load more emails',back:'Back to messages',readOnly:'Your membership is inactive. You can read and manage existing emails, but renew before sending new mail.',busy:'Working…',invalid:'Check the recipient, subject and message before sending',unavailable:'Email service is not available yet. Try again later.',storage:'The browser cannot preserve the pending request. Keep this tab open until you have checked the result in Sent.',changed:'Your account changed. Previous mailbox data is now hidden.',mailboxCreated:'Your mailbox was created',loadFailed:'The data could not load. Try refreshing.' }
};
const LIMIT_COPY = {
  th:{localHint:'3–30 ตัวอักษร ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข จุด ขีดกลาง หรือขีดล่าง ชื่อสงวนอาจใช้ไม่ได้',draftHint:'ส่งได้สูงสุด 20 ข้อความต่อวัน ผู้รับไม่เกิน 5 คนต่อข้อความ ร่างอยู่ในหน้านี้ รายการที่รอยืนยันเก็บในแท็บนี้เพื่อลองด้วยรหัสเดิม',sentCopyMissing:'เซิร์ฟเวอร์รับอีเมลเพื่อส่งแล้ว แต่เก็บสำเนาในโฟลเดอร์ส่งแล้วไม่สำเร็จ ไม่ต้องส่งซ้ำ',retrySend:'ตรวจสอบผลรายการเดิม',partial:'ส่งได้บางผู้รับ ผู้รับที่ไม่สำเร็จ:',provisioningTitle:'กำลังตรวจสอบการสร้างกล่องอีเมล',provisioningText:'ชื่อนี้จองไว้สำหรับบัญชีคุณแล้ว แต่ยังไม่ยืนยันว่ากล่องพร้อมใช้งาน รออย่างน้อย 30 วินาทีแล้วรีเฟรช หากระบบเปิดให้ลองใหม่ จะตรวจสอบชื่อเดิมโดยไม่สร้างกล่องซ้ำ',retryProvision:'ตรวจสอบการสร้างชื่อเดิม',unavailableName:'สร้างชื่อเดิมไม่สำเร็จ กรุณาเลือกชื่อใหม่'},
  en:{localHint:'3–30 characters: lowercase English letters, numbers, dots, hyphens or underscores. Reserved names are unavailable.',draftHint:'Up to 20 messages per day and 5 recipients per message. Drafts stay on this page. Unconfirmed sends stay in this tab so retries use the original identity.',sentCopyMissing:'The server accepted this email, but its Sent copy could not be saved. Do not send it again.',retrySend:'Check original send result',partial:'Only some recipients were accepted. Not sent to:',provisioningTitle:'Checking mailbox creation',provisioningText:'This name is reserved for your account, but the mailbox is not confirmed ready. Wait at least 30 seconds and refresh. When retry becomes available, it checks the original name without creating a duplicate.',retryProvision:'Check original mailbox creation',unavailableName:'The previous mailbox name could not be created. Choose another name.'}
};
const ACCESS_COPY = {
  th:{readOnly:'คุณยังอ่านและจัดการอีเมลเดิมได้ ขณะนี้บัญชีนี้ยังไม่มีสิทธิ์ส่งอีเมลใหม่ ตรวจสอบสถานะสมาชิกหรือสิทธิ์ทดลองก่อนส่ง'},
  en:{readOnly:'You can read and manage existing email. This account cannot currently send new email. Check membership or trial access before sending.'}
};
const MULTI_COPY = {
  th:{chooseMailbox:'อีเมลที่ใช้งาน',addMailbox:'เพิ่มอีเมล',buyCapacity:'ปรับสมาชิก',capacity:'อีเมลที่ใช้ / จำนวนตามสมาชิก',readManageOnly:'อ่านและจัดการเท่านั้น',switchDraft:'เปลี่ยนกล่องและยกเลิกข้อความร่างนี้ใช่ไหม',createText:'สมาชิก Taithai เริ่มต้น 99 บาทต่อเดือน พร้อมอีเมล @taithai.app เพิ่มอีเมลได้ในราคา 99 บาทต่ออีเมลต่อเดือน เลือกชื่อและตรวจสอบก่อนยืนยัน',draftHint:'ส่งได้สูงสุด 20 ข้อความต่อวันต่ออีเมล ผู้รับไม่เกิน 5 คนต่อข้อความ ร่างอยู่ในหน้านี้ รายการส่งที่รอยืนยันจะใช้กล่องเดิมและรหัสเดิม',sendingFrom:'กล่องที่ใช้ส่ง',mailboxAdded:'เพิ่มอีเมลแล้ว',quotaFull:'จำนวนอีเมลตามสมาชิกปัจจุบันถูกใช้ครบแล้ว ปรับสมาชิกเพื่อเพิ่มอีเมล'},
  en:{chooseMailbox:'Current email',addMailbox:'Add email',buyCapacity:'Adjust membership',capacity:'Email used / membership quantity',readManageOnly:'Read and manage only',switchDraft:'Switch mailboxes and discard this draft?',createText:'Taithai membership starts at THB 99 per month with @taithai.app email. Add more email for THB 99 each per month. Review the name before confirming.',draftHint:'Up to 20 messages per day per email address and 5 recipients per message. Drafts stay on this page. Unconfirmed sends retain their original mailbox and request identity.',sendingFrom:'Sending mailbox',mailboxAdded:'Email added',quotaFull:'Your current membership email quantity is fully used. Adjust membership to add email.'}
};
export function safeMailLink(value) { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
function splitMailLink(value,previous) {
  const closing = {'(':')','[':']','{':'}'}[previous];let end = value.length;
  if (closing) {
    while (end && /[.,;:!?]/.test(value[end - 1])) end--;
    if (value[end - 1] === closing) return {link:value.slice(0,end - 1),suffix:value.slice(end - 1)};
  }
  // Signed verification queries/fragments are opaque. Never guess away a
  // punctuation character that might be part of their authentication state.
  if (!/[?#]/.test(value)) while (end && /[.,;:!?]/.test(value[end - 1])) end--;
  else end = value.length;
  return {link:value.slice(0,end),suffix:value.slice(end)};
}
export function appendMailText(node, value, doc = node.ownerDocument) {
  const text = String(value || ''); let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    node.append(doc.createTextNode(text.slice(offset,match.index)));
    const token = splitMailLink(match[0],text[match.index - 1]),href = safeMailLink(token.link);
    if (href) { const link = doc.createElement('a'); link.href = href; link.textContent = token.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; node.append(link,doc.createTextNode(token.suffix)); }
    else node.append(doc.createTextNode(match[0]));
    offset = match.index + match[0].length;
  }
  node.append(doc.createTextNode(text.slice(offset)));
}
export function mailboxLocalPart(value,provider = '') { const name = String(value || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(name) || name.includes('..') || provider === 'hostinger' && !/^[a-z0-9.]+$/.test(name)) throw Object.assign(Error('INVALID_MAILBOX'),{code:'INVALID_MAILBOX'}); return name; }
export function normalizeMailDraft(value) {
  const to = String(value.to || '').trim(), subject = String(value.subject || '').trim(), text = String(value.text || '');
  const recipients = to.split(/[,;\s]+/).filter(Boolean);
  if (!recipients.length || recipients.length > 5 || recipients.some(address => !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address)) || !text.trim() || subject.length > 200 || text.length > 20000 || /[\r\n\u0000]/.test(to + subject) || text.includes('\u0000')) throw Object.assign(Error('INVALID_MESSAGE'),{code:'INVALID_MESSAGE'});
  return {to:recipients.join(', '),subject,text,...(value.inReplyTo ? {inReplyTo:String(value.inReplyTo)} : {})};
}
export function safeReplyAddress(value) { const address = String(value || '').trim();return address.length <= 254 && /^[A-Za-z0-9!#$%&'*+\/?=^_`{|}~.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(address) ? address : ''; }
export function initMailPage({ window: win = globalThis.window, document: doc = win?.document, loadAuth = () => import('/firebase-auth.js?v=20260725-2'), request } = {}) {
  const root = doc?.getElementById('mailPanel'); if (!root || root.dataset.mailInitialized) return null; root.dataset.mailInitialized = 'true';
  const ui = createMemberUi(doc), locale = () => membershipLanguage(win,doc), t = () => ({...COPY[locale()],...LIMIT_COPY[locale()],...ACCESS_COPY[locale()],...MULTI_COPY[locale()]}), common = () => membershipText(locale());
  let auth, user = null, checked = false, authFailed = false, authTimer, pollTimer, state = null, loading = false, incomingLoading = false, busy = '', epoch = 0, authGeneration = 0, mailboxRequest = 0, messageRequest = 0, disposed = false, unsubscribe = () => {}, status = null;
  let folders = [], folder = '', messages = [], cursor = null, selected = null, composing = false, draft = {to:'',subject:'',text:''}, pending = null, localPart = '', createAttempt = null, creationAttempts = new Map(), storageBlocked = false, incomingDirty = false, expandedMessages = false, selectedMailboxId = '', preferredMailboxId = '', creatingVisible = false;
  const api = createMembershipApi({getUser:() => user,window:win,request});
  const trialReady = () => state?.ownerTrial !== true || state?.mailReady === true;
  const writable = () => (typeof mailbox()?.canSend === 'boolean' ? mailbox().canSend : state?.canSend === true) && trialReady() && state?.capabilities?.mail !== false;
  const canCreate = () => state?.canCreate === true && trialReady() && state?.capabilities?.mail !== false;
  const mailProvider = () => state?.mailProvider || state?.provider || '';
  const localHint = () => mailProvider() === 'hostinger' ? (locale() === 'th' ? '3–30 ตัวอักษร ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข และจุดเท่านั้น ไม่ขึ้นต้นหรือลงท้ายด้วยจุด และไม่ใช้จุดติดกัน ชื่อสงวนอาจใช้ไม่ได้' : '3–30 characters: lowercase English letters, numbers and dots only. No leading, trailing or consecutive dots. Reserved names are unavailable.') : t().localHint;
  const canManage = () => Boolean(mailbox()) && (typeof mailbox()?.canManageMessages === 'boolean' ? mailbox().canManageMessages : state?.canManageMessages !== false) && state?.capabilities?.mail !== false;
  const boxes = () => Array.isArray(state?.mailboxes) ? state.mailboxes : [];
  const mailbox = () => boxes().find(box => box.id === selectedMailboxId) || boxes()[0];
  const pendingBoxes = () => Array.isArray(state?.pendingMailboxes) ? state.pendingMailboxes : state?.mailbox?.status === 'provisioning' ? [{...state.mailbox,canRetryProvisioning:state.canRetryProvisioning}] : [];
  const capacity = () => Number.isInteger(Number(state?.mailboxCapacity)) ? Number(state.mailboxCapacity) : Number.isInteger(Number(state?.mailboxLimit)) ? Number(state.mailboxLimit) : membershipActive(state) || state?.ownerTrial ? 1 : 0;
  function resetMailboxView() {folders = [];folder = '';messages = [];cursor = null;selected = null;expandedMessages = false;incomingDirty = false;mailboxRequest++;messageRequest++;}
  function reconcileMailbox() {
    const preferred = preferredMailboxId || selectedMailboxId || pending?.payload?.mailbox;
    const next = boxes().find(box => box.id === preferred)?.id || boxes()[0]?.id || '';
    if (selectedMailboxId !== next) resetMailboxView();selectedMailboxId = next;preferredMailboxId = '';
  }
  const storageKey = () => `taithai.mail.pending.v1:${user?.uid || ''}`;
  const creationKey = () => `taithai.mail.provision.v1:${user?.uid || ''}`;
  function saveCreation() {try {if (creationAttempts.size) win.sessionStorage.setItem(creationKey(),JSON.stringify({attempts:[...creationAttempts.values()]}));else win.sessionStorage.removeItem(creationKey());}catch {/* Backend reconciles the reserved name even without browser storage. */}}
  function savePending() { try { if (pending) win.sessionStorage.setItem(storageKey(),JSON.stringify(pending)); else win.sessionStorage.removeItem(storageKey()); } catch { storageBlocked = true; } }
  function restorePending() { pending = null; try { const value = JSON.parse(win.sessionStorage.getItem(storageKey()) || 'null'); if (value && /^[A-Za-z0-9_-]{16,100}$/.test(value.requestId || '') && value.payload && typeof value.payload.text === 'string' && (!value.payload.mailbox || typeof value.payload.mailbox === 'string' && value.payload.mailbox.length <= 256)) { normalizeMailDraft(value.payload); pending = value; draft = {...value.payload}; composing = true; } } catch { storageBlocked = true; } }
  function notice(message, error = false) { status = {message,error}; }
  function field(id,label,type,value,onInput,{required = false,hint = '',disabled = false} = {}) {
    const input = ui.el(type === 'textarea' ? 'textarea' : 'input'); input.id = id; if (type !== 'textarea') input.type = type; input.value = value || ''; input.required = required; input.disabled = disabled; input.addEventListener('input',() => onInput(input.value));
    if (type === 'email') { input.multiple = true; input.autocomplete = 'off'; }
    if (id === 'mailSubject') input.maxLength = 200;
    if (id === 'mailBody') input.maxLength = 20000;
    return ui.field(label,input,hint);
  }
  function folderName(item) { const key = String(item.id || item.name || '').toLowerCase().replace(/[^a-z]/g,''); return ({inbox:t().inbox,sent:t().sent,sentitems:t().sent,trash:t().trash,deleteditems:t().trash,drafts:t().drafts,junk:t().junk,spam:t().junk,archive:t().archive,all:t().all})[key] || item.name || item.id; }
  function switchMailbox(id) {
    if (id === mailbox()?.id) return true;
    if (!boxes().some(box => box.id === id) || busy && busy !== 'read') return false;
    if (!pending && (draft.to || draft.subject || draft.text) && !win.confirm(t().switchDraft)) return false;
    win.clearTimeout(pollTimer);api.abort();epoch++;loading = false;incomingLoading = false;busy = '';selectedMailboxId = id;resetMailboxView();status = null;
    if (!pending) {draft = {to:'',subject:'',text:''};composing = false;}
    render();void refreshMailbox();scheduleIncoming();return true;
  }
  function renderMailboxManagement() {
    const text = t(),panel = ui.panel(text.chooseMailbox);panel.classList.add('mailbox-management');
    const used = Number.isInteger(Number(state.mailboxUsed)) ? Number(state.mailboxUsed) : boxes().length + pendingBoxes().length;
    panel.append(ui.el('p',text.capacity + ' · ' + used + ' / ' + capacity(),'mailbox-capacity'));
    if (boxes().length) {
      const input = ui.el('select');input.id = 'mailboxSelector';input.disabled = Boolean(busy && busy !== 'read');
      for (const box of boxes()) {const option = ui.el('option',(box.address || box.id) + (box.canSend === false ? ' · ' + text.readManageOnly : ''));option.value = box.id;option.selected = box.id === mailbox()?.id;input.append(option);}
      input.value = mailbox().id;input.addEventListener('change',() => {if (!switchMailbox(input.value)) input.value = mailbox()?.id || '';});const control = ui.field(text.chooseMailbox,input);control.classList.add('mail-account-control');panel.append(control);
    }
    const actions = ui.el('div',undefined,'button-row');
    actions.append(ui.button(text.addMailbox,() => {creatingVisible = !creatingVisible;render();doc.getElementById('mailboxName')?.focus();},{primary:true,disabled:!canCreate() || Boolean(busy)}),ui.link(text.buyCapacity,'/membership/#quantity'));
    panel.append(actions);
    if (!canCreate() && used >= capacity()) panel.append(ui.el('p',text.quotaFull,'small'));
    const reservations = pendingBoxes();
    if (reservations.length) {
      const list = ui.el('div',undefined,'mailbox-pending-list');
      for (const item of reservations) {
        const pendingPanel = ui.panel(text.provisioningTitle,text.provisioningText);pendingPanel.append(ui.el('p',item.address || '', 'membership-address'));
        const controls = ui.el('div',undefined,'button-row');controls.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}),ui.button(text.retryProvision,() => createMailbox(item.localPart,item.id),{disabled:item.canRetryProvisioning !== true || !trialReady() || Boolean(busy)}));pendingPanel.append(controls);list.append(pendingPanel);
      }
      panel.append(list);
    }
    return panel;
  }
  function renderCreation() {
    const text = t(),panel = ui.panel(text.create,text.createText),form = ui.el('form');form.id = 'mailboxCreateForm';
    const input = ui.el('input');input.type = 'text';input.id = 'mailboxName';input.autocomplete = 'off';input.autocapitalize = 'none';input.minLength = 3;input.maxLength = 30;if (mailProvider() === 'hostinger') input.pattern = '(?!.*\\.\\.)[a-z0-9][a-z0-9.]{1,28}[a-z0-9]';input.required = true;input.value = localPart;input.disabled = Boolean(busy);input.addEventListener('input',() => {localPart = input.value;});
    const group = ui.el('div',undefined,'mailbox-name-control');group.append(input,ui.el('span','@taithai.app'));const label = ui.el('label',text.local);label.htmlFor = input.id;const wrapper = ui.el('div',undefined,'field');wrapper.append(label,group,ui.el('p',localHint(),'field-hint'));form.append(wrapper);
    const submit = ui.el('button',busy === 'create' ? text.busy : text.createButton,'button button-primary');submit.type = 'submit';submit.disabled = Boolean(busy) || !canCreate();form.append(submit);form.addEventListener('submit',event => {event.preventDefault();void createMailbox();});panel.append(form);return panel;
  }
  function render() {
    if (disposed) return;incomingDirty = false;
    const text = t(), base = common(); root.replaceChildren(); root.setAttribute('aria-busy',String(!checked || loading || Boolean(busy)));
    if (!checked) { root.append(ui.panel('',text.loading)); return; }
    if (status) { const note = ui.el('p',status.message,status.error ? 'notice notice-error' : 'notice'); note.setAttribute('role',status.error ? 'alert' : 'status'); root.append(note); }
    if (!user) { const gate = ui.panel(text.login,text.loginText); gate.append(ui.button(auth && !authFailed ? base.signIn : base.retry,auth && !authFailed ? signIn : start,{primary:true,disabled:Boolean(busy)})); root.append(gate); return; }
    if (!state) { root.append(ui.panel('',loading ? text.loading : text.loadFailed)); if (!loading) root.append(ui.button(base.retry,refresh)); return; }
    if (state.testMode) root.append(membershipSetup(ui,base,true));
    if (!membershipReady(state)) root.append(membershipSetup(ui,base));
    if (state.ownerTrial === true) root.append(ui.panel(base.ownerTrialTitle,base.ownerTrialText));
    if (boxes().length || pendingBoxes().length) root.append(renderMailboxManagement());
    if (!mailbox()) {
      if (pending) root.append(renderCompose());
      if (state.mailbox?.status === 'unavailable') root.append(ui.panel('',text.unavailableName));
      if (canCreate() || !pendingBoxes().length && (membershipActive(state) || state.ownerTrial === true)) root.append(renderCreation());
      else if (!pendingBoxes().length) root.append(ui.panel('',text.noMailbox));
      root.append(ui.link(text.membership,'/membership/')); return;
    }
    if (creatingVisible) root.append(renderCreation());
    if (!writable()) { const note = ui.panel('',text.readOnly); note.append(ui.link(text.membership,'/membership/')); root.append(note); }
    const head = ui.el('div',undefined,'mail-toolbar'); head.append(ui.el('p',mailbox().address || '', 'membership-address'));
    const actions = ui.el('div',undefined,'button-row'); actions.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}),ui.button(text.compose,() => {composing = true; render(); doc.getElementById('mailTo')?.focus();},{primary:true,disabled:!writable() || Boolean(busy) || Boolean(pending)})); head.append(actions); root.append(head);
    if (composing || pending) root.append(renderCompose());
    const workspace = ui.el('div',undefined,'mail-workspace');
    const folderNav = ui.el('nav',undefined,'mail-folders panel'); folderNav.setAttribute('aria-label',text.folders); folderNav.append(ui.el('h2',text.folders));
    for (const item of folders) { const row = ui.button(folderName(item),() => selectFolder(item.id),{disabled:loading || Boolean(busy)}); row.classList.add('mail-folder'); row.setAttribute('aria-current',item.id === folder ? 'page' : 'false'); if (Number(item.unread) > 0) row.append(ui.el('span',String(item.unread),'mail-unread-count')); folderNav.append(row); }
    workspace.append(folderNav);
    const list = ui.el('section',undefined,'mail-message-list panel'); list.setAttribute('aria-label',folders.find(item => item.id === folder) ? folderName(folders.find(item => item.id === folder)) : text.all);
    list.append(ui.el('h2',folders.find(item => item.id === folder) ? folderName(folders.find(item => item.id === folder)) : text.all));
    if (!messages.length) list.append(ui.el('p',loading ? text.loading : text.empty,'muted'));
    for (const message of messages) {
      const row = ui.el('button',undefined,`mail-message${message.unread ? ' is-unread' : ''}`); row.type = 'button'; row.disabled = Boolean(busy); row.setAttribute('aria-current',selected?.id === message.id ? 'true' : 'false');
      row.append(ui.el('span',message.from || '', 'mail-message-from'),ui.el('strong',message.subject || text.subjectEmpty,'mail-message-subject'),ui.el('time',memberDate(message.date,locale()),'mail-message-date'));
      if (message.preview) row.append(ui.el('span',message.preview,'mail-message-preview'));
      if (message.unread) row.setAttribute('aria-label',`${message.subject || text.subjectEmpty} · ${text.markRead}`);
      row.addEventListener('click',() => openMessage(message.id)); list.append(row);
    }
    if (cursor) list.append(ui.button(text.more,() => loadMessages(true),{disabled:loading || Boolean(busy)})); workspace.append(list);
    const detail = ui.el('section',undefined,'mail-reader panel'); detail.setAttribute('aria-label',text.body);
    if (!selected) detail.append(ui.el('p',text.emptyDetail,'muted'));
    else {
      detail.append(ui.el('h2',selected.subject || text.subjectEmpty)); const meta = ui.el('dl',undefined,'mail-message-meta');
      for (const [label,value] of [[text.from,selected.from],[locale() === 'th' ? 'ตอบกลับไปยัง' : 'Reply to',safeReplyAddress(selected.replyToAddress)],[text.to,selected.to],[text.cc,selected.cc],[text.date,memberDate(selected.date,locale())]]) if (value) meta.append(ui.el('dt',label),ui.el('dd',value)); detail.append(meta);
      const controls = ui.el('div',undefined,'button-row'); controls.append(ui.button(text.reply,reply,{disabled:!writable() || Boolean(busy) || Boolean(pending) || !safeReplyAddress(selected.replyToAddress)}),ui.button(selected.unread ? text.markRead : text.markUnread,() => changeFlags({read:Boolean(selected.unread)}),{disabled:!canManage() || Boolean(busy)}),ui.button(text.moveTrash,trash,{danger:true,disabled:!canManage() || Boolean(busy)})); detail.append(controls);
      const body = ui.el('div',undefined,'mail-message-body'); appendMailText(body,selected.text,doc); detail.append(body,ui.el('p',text.plain,'small'));
      if (selected.attachments?.length) { const attachments = ui.el('section',undefined,'mail-attachments'); attachments.append(ui.el('h3',text.attachments)); const names = ui.el('ul'); for (const attachment of selected.attachments) names.append(ui.el('li',`${attachment.filename || attachment.name || 'Attachment'}${Number.isFinite(attachment.size) ? ` · ${new Intl.NumberFormat(locale()).format(attachment.size)} B` : ''}`)); attachments.append(names,ui.el('p',text.attachmentNote,'small')); detail.append(attachments); }
    }
    workspace.append(detail); root.append(workspace);
  }
  function renderCompose() {
    const text = t(), panel = ui.panel(pending ? text.sendPending : text.compose), form = ui.el('form'); panel.classList.add('mail-compose');
    form.id = 'mailComposeForm';
    const from = pending ? pending.mailboxAddress || boxes().find(box => box.id === pending.payload.mailbox)?.address || pending.payload.mailbox : mailbox()?.address;
    panel.append(ui.el('p',text.sendingFrom + ' · ' + (from || ''),'membership-address'));
    if (pending) panel.append(ui.el('p',text.sendPendingText,'notice'),ui.link(common().help,'/support/?app=Taithai%20Mail'));
    if (storageBlocked && pending) panel.append(ui.el('p',text.storage,'notice notice-error'));
    const locked = Boolean(pending) || Boolean(busy);
    form.append(field('mailTo',text.to,'email',draft.to,value => {draft.to = value;},{required:true,disabled:locked}),field('mailSubject',text.subject,'text',draft.subject,value => {draft.subject = value;},{disabled:locked}),field('mailBody',text.body,'textarea',draft.text,value => {draft.text = value;},{required:true,hint:text.draftHint,disabled:locked}));
    const actions = ui.el('div',undefined,'button-row'), sendButton = ui.el('button',busy === 'send' ? text.sending : pending ? text.retrySend : text.send,'button button-primary'); sendButton.type = 'submit'; sendButton.disabled = Boolean(busy) || !pending && !writable(); actions.append(sendButton,ui.button(pending ? text.pendingDiscard : text.discard,discard,{disabled:Boolean(busy)})); form.append(actions); form.addEventListener('submit',event => {event.preventDefault();void send();}); panel.append(form); return panel;
  }
  async function refresh() {
    if (!user || loading || busy || disposed) return; const current = epoch; loading = true; status = null; render();
    try { const result = await api.call('status'); if (disposed || current !== epoch) return; state = result;reconcileMailbox(); }
    catch (error) { if (!disposed && current === epoch) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true); }
    finally { if (!disposed && current === epoch) { loading = false; render(); if (mailbox()) {void refreshMailbox();scheduleIncoming();} } }
  }
  async function refreshMailbox({silent = false} = {}) {
    if (!user || !mailbox() || loading || busy || disposed || silent && incomingLoading) return;
    const current = epoch,sequence = ++mailboxRequest;let changed = false;
    if (silent) incomingLoading = true;else {loading = true;render();}
    try {
      const result = await api.call('folders',{params:{mailbox:mailbox().id}});
      if (current !== epoch || sequence !== mailboxRequest || disposed) return;
      const nextFolders = result.folders || [],nextFolder = nextFolders.some(item => item.id === folder) ? folder : nextFolders.find(item => String(item.id).toLowerCase() === 'inbox')?.id || nextFolders[0]?.id || '';
      const list = nextFolder ? await api.call('messages',{params:{mailbox:mailbox().id,folder:nextFolder}}) : {messages:[],nextCursor:null};
      if (current !== epoch || sequence !== mailboxRequest || disposed) return;
      const nextMessages = list.messages || [],nextCursor = list.nextCursor || null;
      changed = JSON.stringify([folders,folder,messages,cursor]) !== JSON.stringify([nextFolders,nextFolder,nextMessages,nextCursor]);
      folders = nextFolders;folder = nextFolder;messages = nextMessages;cursor = nextCursor;
      if (!silent) expandedMessages = false;
    } catch (error) {if (!silent && current === epoch && !disposed) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true);}
    finally {if (current === epoch && !disposed) {
      if (silent) incomingLoading = false;
      if (sequence !== mailboxRequest) return;
      if (!silent) {loading = false;render();}
      else if (changed || incomingDirty) {
        incomingDirty = true;
        if (!composing && !pending && !busy && doc.hidden !== true && win.getSelection?.()?.isCollapsed !== false) render();
      }
    }}
  }
  function checkIncoming() {
    if (disposed || !user || !mailbox() || loading || incomingLoading || busy || composing || pending || expandedMessages || doc.hidden === true || win.navigator?.onLine === false || state?.capabilities?.mail === false || win.getSelection?.()?.isCollapsed === false) return Promise.resolve();
    return refreshMailbox({silent:true});
  }
  function scheduleIncoming() {
    win.clearTimeout(pollTimer);
    if (disposed || !user || !mailbox() || doc.hidden === true) return;
    pollTimer = win.setTimeout(() => {pollTimer = undefined;void checkIncoming().finally(scheduleIncoming);},30000);
  }
  function wakeIncoming() {if (doc.hidden === true) {win.clearTimeout(pollTimer);return;}void checkIncoming();scheduleIncoming();}
  async function loadMessages(more = false) {
    if (!mailbox() || !folder || loading || disposed) return;
    const current = epoch, targetFolder = folder, sequence = ++mailboxRequest; loading = true; render();
    try { const result = await api.call('messages',{params:{mailbox:mailbox().id,folder,cursor:more ? cursor : undefined}}); if (disposed || current !== epoch || sequence !== mailboxRequest || folder !== targetFolder) return; const incoming = result.messages || []; messages = more ? [...new Map([...messages,...incoming].map(item => [item.id,item])).values()] : incoming; cursor = result.nextCursor || null;expandedMessages = more; }
    catch (error) { if (current === epoch && !disposed) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true); }
    finally { if (!disposed && current === epoch && sequence === mailboxRequest) { loading = false; render(); } }
  }
  function selectFolder(id) { if (id === folder || loading || busy) return; folder = id; selected = null; messages = []; cursor = null;expandedMessages = false; messageRequest++; void loadMessages(); }
  async function openMessage(id) {
    if (!mailbox() || busy) return; const current = epoch, sequence = ++messageRequest; busy = 'read'; render();
    try { const result = await api.call('message',{params:{mailbox:mailbox().id,id}}); if (current !== epoch || sequence !== messageRequest || disposed) return; selected = result.message; }
    catch (error) { if (current === epoch && !disposed) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true); }
    finally { if (current === epoch && sequence === messageRequest && !disposed) { busy = ''; render(); } }
  }
  async function createMailbox(recoveryName,recoveryId) {
    const reservation = pendingBoxes().find(item => recoveryId ? item.id === recoveryId : item.localPart === recoveryName);
    const retry = Boolean(reservation && reservation.canRetryProvisioning === true && recoveryName === reservation.localPart && trialReady());
    if ((!canCreate() && !retry) || busy) return;
    let name; try { name = mailboxLocalPart(retry ? reservation.localPart : localPart,mailProvider()); } catch (error) {notice(membershipError(error,locale()),true);render();return;}
    if (!win.confirm(`${t().createConfirm}\n${name}@taithai.app`)) return;
    createAttempt = creationAttempts.get(name) || {localPart:name,requestId:win.crypto.randomUUID()};creationAttempts.set(name,createAttempt);saveCreation();
    const current = epoch; busy = 'create'; status = null; render();
    try { const result = await api.call('mailbox-create',{method:'POST',data:createAttempt}); if (current !== epoch || disposed) return;if (result.createdMailbox?.status === 'active') preferredMailboxId = result.createdMailbox.id;notice(t().mailboxAdded);creationAttempts.delete(name);createAttempt = null;creatingVisible = false;localPart = '';saveCreation(); }
    catch (error) { if (current === epoch && !disposed) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true); }
    finally { if (current === epoch && !disposed) { busy = ''; render(); void refresh(); } }
  }
  function reply() { const recipient = safeReplyAddress(selected?.replyToAddress);if (!selected || !recipient || pending || !writable()) return; if ((draft.text || draft.to || draft.subject) && !win.confirm(t().discardConfirm)) return; draft = {to:recipient,subject:/^re:/i.test(selected.subject || '') ? selected.subject : `Re: ${selected.subject || ''}`,text:'',inReplyTo:selected.id}; composing = true; render(); doc.getElementById('mailBody')?.focus(); }
  function discard() { if (busy || (pending || draft.text || draft.to || draft.subject) && !win.confirm(pending ? t().pendingDiscardConfirm : t().discardConfirm)) return; pending = null; savePending(); draft = {to:'',subject:'',text:''}; composing = false; render(); }
  async function send() {
    if (busy || !pending && (!writable() || !mailbox())) return;
    const retrying = Boolean(pending);
    let payload; try { payload = pending?.payload || {...normalizeMailDraft(draft),mailbox:mailbox().id}; } catch {notice(t().invalid,true);render();return;}
    const fromAddress = pending?.mailboxAddress || boxes().find(box => box.id === payload.mailbox)?.address || payload.mailbox || '';
    if (!win.confirm(t().sendConfirm + '\n' + t().from + ': ' + fromAddress + '\n' + t().to + ': ' + payload.to)) return;
    if (!pending) pending = {requestId:win.crypto.randomUUID(),payload,mailboxAddress:mailbox()?.address || ''}; savePending();
    const current = epoch; busy = 'send'; status = null; render();
    try {
      const result = await api.call('send',{method:'POST',data:{...pending.payload,requestId:pending.requestId}});
      if (current !== epoch || disposed) return;
      if (result.status === 'blocked') {pending = null;savePending();notice(common().permission,true);return;}
      if (result.status !== 'sent') {notice(t().sendPending,true);return;}
      pending = null; savePending(); draft = {to:'',subject:'',text:''}; composing = false;
      const receipt = result.partial === true ? `${t().partial} ${(result.rejected || []).join(', ')}` : t().sentOk;
      notice(fromAddress + ' · ' + (result.sentCopySaved === false ? `${receipt} ${t().sentCopyMissing}` : receipt),result.partial === true);
    } catch (error) { if (current === epoch && !disposed) {
      const certainFailure = !retrying && [400,401,403,404,409,429].includes(error.status);
      if (certainFailure) {pending = null;savePending();notice(membershipError(error,locale(),win.navigator?.onLine !== false),true);}
      else notice(`${t().sendPending} · ${membershipError(error,locale(),win.navigator?.onLine !== false)}`,true);
    } }
    finally { if (current === epoch && !disposed) { busy = ''; render(); } }
  }
  async function changeFlags(flags) {
    if (!selected || !canManage() || busy) return; const current = epoch, id = selected.id; busy = 'flags'; status = null; render();
    try { await api.call('message-flags',{method:'POST',data:{mailbox:mailbox().id,id,...flags}}); if (current !== epoch || disposed) return; if (flags.trash) { messages = messages.filter(item => item.id !== id); selected = null; } else { selected = {...selected,unread:!flags.read}; messages = messages.map(item => item.id === id ? {...item,unread:!flags.read} : item); } }
    catch (error) { if (current === epoch && !disposed) notice(membershipError(error,locale(),win.navigator?.onLine !== false),true); }
    finally { if (current === epoch && !disposed) { busy = ''; render(); } }
  }
  function trash() { if (win.confirm(t().trashConfirm)) void changeFlags({trash:true}); }
  async function signIn() { if (busy) return; busy = 'login'; render(); try { await auth.loginWithGoogle(); } catch (error) {notice(membershipError(error,locale()),true);} finally {busy = '';render();} }
  async function start() {
    const current = ++authGeneration; epoch++; checked = false;authFailed = false;win.clearTimeout(authTimer);render();
    authTimer = win.setTimeout(() => {if (!disposed && current === authGeneration && !checked) {checked = true;authFailed = true;notice(common().auth,true);render();}},12000);
    try {
      auth = await loadAuth(); if (disposed || current !== authGeneration) return; unsubscribe();
      unsubscribe = auth.subscribeAuth(value => {
        if (disposed || current !== authGeneration) return;
        win.clearTimeout(authTimer);win.clearTimeout(pollTimer);authFailed = false;api.abort();epoch++;user = value;checked = true;state = null;loading = false;incomingLoading = false;busy = '';
        folders = [];messages = [];selected = null;cursor = null;expandedMessages = false;folder = '';pending = null;composing = false;draft = {to:'',subject:'',text:''};status = null;createAttempt = null;creationAttempts = new Map();selectedMailboxId = '';preferredMailboxId = '';creatingVisible = false;localPart = '';
        if (user) {
          restorePending();
          try {
            const saved = JSON.parse(win.sessionStorage.getItem(creationKey()) || 'null'),attempts = Array.isArray(saved?.attempts) ? saved.attempts : saved ? [saved] : [];
            for (const attempt of attempts) if (/^[A-Za-z0-9_-]{16,100}$/.test(attempt.requestId || '')) {mailboxLocalPart(attempt.localPart);creationAttempts.set(attempt.localPart,attempt);}
          } catch {/* Ignore a damaged, optional retry record. */}
        }
        render();if (user) void refresh();
      });
    }
    catch (error) { if (!disposed && current === authGeneration) {win.clearTimeout(authTimer);checked = true;authFailed = true;notice(membershipError(error,locale()),true);render();} }
  }
  function suspend() {authGeneration++;epoch++;win.clearTimeout(authTimer);win.clearTimeout(pollTimer);api.abort();unsubscribe();unsubscribe = () => {};user = null;state = null;messages = [];selected = null;folders = [];draft = {to:'',subject:'',text:''};pending = null;composing = false;selectedMailboxId = '';preferredMailboxId = '';creatingVisible = false;creationAttempts = new Map();checked = false;loading = false;incomingLoading = false;busy = '';render();}
  function beforeUnload(event) { if (composing && (draft.text || draft.to || draft.subject) && !pending) {event.preventDefault();event.returnValue = '';} }
  const preferences = () => render(), restore = event => {if (event.persisted) void start();};
  win.addEventListener('taithai:preferences',preferences);win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',restore);win.addEventListener('beforeunload',beforeUnload);win.addEventListener('focus',wakeIncoming);win.addEventListener('online',wakeIncoming);doc.addEventListener('visibilitychange',wakeIncoming);void start();
  return {refresh,destroy(){disposed = true;authGeneration++;epoch++;win.clearTimeout(authTimer);win.clearTimeout(pollTimer);api.abort();unsubscribe();win.removeEventListener('taithai:preferences',preferences);win.removeEventListener('pagehide',suspend);win.removeEventListener('pageshow',restore);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('focus',wakeIncoming);win.removeEventListener('online',wakeIncoming);doc.removeEventListener('visibilitychange',wakeIncoming);delete root.dataset.mailInitialized;}};
}
if (typeof window !== 'undefined' && document.body?.dataset.page === 'mail') initMailPage();
