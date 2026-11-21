/* Plain-text webmail. Received HTML is never rendered, and browser storage never
   contains mailbox credentials. Pending sends retain their idempotency identity. */
import { createMembershipApi, createMemberUi, membershipText, membershipLanguage, membershipError, memberDate } from './site-membership.js';
import { verifiedAccount } from './site-admin-api.js';
const COPY = {
  th:{ loading:'กำลังโหลดกล่องอีเมล…',login:'เข้าสู่ระบบเพื่อเปิดอีเมล',loginText:'ใช้บัญชี Google ที่ได้รับสิทธิ์เพื่อจัดการอีเมล @taithai.app ของคุณ',create:'ตั้งชื่ออีเมลของคุณ',createText:'เลือกชื่อที่ต้องการแล้วตรวจสอบก่อนยืนยัน ระบบจะสร้างเมื่อคุณกดยืนยันเท่านั้น',local:'ชื่อก่อน @taithai.app',localHint:'ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข จุด ขีดกลาง หรือขีดล่าง ตามเงื่อนไขของเซิร์ฟเวอร์',createButton:'เพิ่มอีเมล',createConfirm:'สร้างอีเมลชื่อนี้ใช่ไหม',noMailbox:'ยังไม่มีอีเมล คุณสามารถตั้งชื่ออีเมลแรกได้เมื่อบริการพร้อม',folders:'โฟลเดอร์',inbox:'กล่องขาเข้า',sent:'ส่งแล้ว',trash:'ถังขยะ',drafts:'ฉบับร่าง',junk:'จดหมายขยะ',archive:'เก็บถาวร',all:'อีเมลทั้งหมด',refresh:'รีเฟรช',compose:'เขียนอีเมล',empty:'ยังไม่มีอีเมลในโฟลเดอร์นี้',emptyDetail:'เลือกอีเมลเพื่ออ่าน',subjectEmpty:'(ไม่มีหัวข้อ)',from:'จาก',to:'ถึง',cc:'สำเนา',date:'วันที่',subject:'หัวข้อ',body:'ข้อความ',send:'ส่งอีเมล',sending:'กำลังส่ง…',reply:'ตอบกลับ',markRead:'ทำเครื่องหมายว่าอ่านแล้ว',markUnread:'ทำเครื่องหมายว่ายังไม่อ่าน',moveTrash:'ย้ายไปถังขยะ',trashConfirm:'ย้ายอีเมลนี้ไปถังขยะใช่ไหม',discard:'ปิดฉบับร่าง',discardConfirm:'ยกเลิกข้อความร่างนี้ใช่ไหม',sendConfirm:'ส่งอีเมลนี้ไปยังผู้รับที่ระบุใช่ไหม',sentOk:'เซิร์ฟเวอร์รับอีเมลเพื่อส่งแล้ว ตรวจสอบได้ที่โฟลเดอร์ส่งแล้ว',sendPending:'ยังยืนยันผลการส่งไม่ได้',sendPendingText:'ข้อความนี้ถูกล็อกไว้เพื่อป้องกันการส่งซ้ำ ตรวจสอบโฟลเดอร์ส่งแล้วก่อน หากยังไม่มี ให้ลองส่งรายการเดิมด้วยรหัสเดิม',retrySend:'ตรวจสอบและลองส่งรายการเดิม',pendingDiscard:'ล้างรายการที่รอยืนยัน',pendingDiscardConfirm:'ตรวจสอบโฟลเดอร์ส่งแล้วหรือยัง? การล้างรายการนี้ไม่ได้ยกเลิกอีเมลที่เซิร์ฟเวอร์อาจส่งไปแล้ว การเขียนส่งใหม่อาจทำให้ซ้ำ',draftHint:'ร่างอยู่ในหน้านี้เท่านั้น รายการส่งที่รอยืนยันจะเก็บไว้ในแท็บนี้เพื่อให้ลองด้วยรหัสเดิม',plain:'แสดงอีเมลเป็นข้อความธรรมดาเพื่อความปลอดภัย ไม่โหลดรูปภายนอกหรือ HTML',attachments:'ไฟล์แนบ',attachmentNote:'ขณะนี้แสดงชื่อและขนาดไฟล์แนบ การดาวน์โหลดยังไม่เปิดให้ใช้',more:'โหลดอีเมลเพิ่มเติม',back:'กลับรายการอีเมล',readOnly:'ขณะนี้ยังส่งอีเมลไม่ได้ คุณยังอ่านและจัดการอีเมลเดิมได้เมื่อบริการพร้อม',busy:'กำลังดำเนินการ…',invalid:'ตรวจสอบผู้รับ หัวข้อ และข้อความก่อนส่ง',unavailable:'บริการอีเมลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',storage:'เบราว์เซอร์ไม่ให้เก็บรายการที่รอยืนยัน อย่าปิดแท็บจนกว่าจะตรวจสอบผลส่งแล้ว',changed:'บัญชีเปลี่ยนแล้ว ข้อมูลอีเมลก่อนหน้าถูกซ่อน',mailboxCreated:'สร้างกล่องอีเมลแล้ว',loadFailed:'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง' },
  en:{ loading:'Loading your mailbox…',login:'Sign in to open mail',loginText:'Use an authorized Google account to manage your own @taithai.app email',create:'Choose your email address',createText:'Choose a name and review it before confirming. Nothing is created until you confirm.',local:'Name before @taithai.app',localHint:'Use lowercase English letters, numbers, dots, hyphens or underscores, subject to server validation.',createButton:'Add email',createConfirm:'Create this email address?',noMailbox:'No email address yet. Choose your first address when the service is ready.',folders:'Folders',inbox:'Inbox',sent:'Sent',trash:'Trash',drafts:'Drafts',junk:'Junk',archive:'Archive',all:'All mail',refresh:'Refresh',compose:'Compose',empty:'No messages in this folder',emptyDetail:'Choose an email to read',subjectEmpty:'(No subject)',from:'From',to:'To',cc:'Cc',date:'Date',subject:'Subject',body:'Message',send:'Send email',sending:'Sending…',reply:'Reply',markRead:'Mark as read',markUnread:'Mark as unread',moveTrash:'Move to Trash',trashConfirm:'Move this email to Trash?',discard:'Close draft',discardConfirm:'Discard this draft?',sendConfirm:'Send this email to the listed recipient?',sentOk:'The server accepted this email for sending. Check the Sent folder.',sendPending:'Sending has not been confirmed',sendPendingText:'This message is locked to prevent duplicate sending. Check Sent first. If it is missing, retry the original request with the same identity.',retrySend:'Check and retry original send',pendingDiscard:'Clear pending request',pendingDiscardConfirm:'Have you checked Sent? Clearing this request does not cancel an email the server may already have sent. Sending a new draft could create a duplicate.',draftHint:'Drafts stay on this page. Unconfirmed sends are kept in this tab so retries use the original identity.',plain:'Emails are shown as plain text for safety. External images and HTML are not loaded.',attachments:'Attachments',attachmentNote:'Attachment names and sizes are shown. Downloads are not available yet.',more:'Load more emails',back:'Back to messages',readOnly:'Sending is currently unavailable. You can read and manage existing email when the service is ready.',busy:'Working…',invalid:'Check the recipient, subject and message before sending',unavailable:'Email service is not available yet. Try again later.',storage:'The browser cannot preserve the pending request. Keep this tab open until you have checked the result in Sent.',changed:'Your account changed. Previous mailbox data is now hidden.',mailboxCreated:'Your mailbox was created',loadFailed:'The data could not load. Try refreshing.' }
};
const LIMIT_COPY = {
  th:{localHint:'3–30 ตัวอักษร ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข จุด ขีดกลาง หรือขีดล่าง ชื่อสงวนอาจใช้ไม่ได้',draftHint:'ส่งได้สูงสุด 20 ข้อความต่อวัน ผู้รับไม่เกิน 5 คนต่อข้อความ ร่างอยู่ในหน้านี้ รายการที่รอยืนยันเก็บในแท็บนี้เพื่อลองด้วยรหัสเดิม',sentCopyMissing:'เซิร์ฟเวอร์รับอีเมลเพื่อส่งแล้ว แต่เก็บสำเนาในโฟลเดอร์ส่งแล้วไม่สำเร็จ ไม่ต้องส่งซ้ำ',retrySend:'ตรวจสอบผลรายการเดิม',partial:'ส่งได้บางผู้รับ ผู้รับที่ไม่สำเร็จ:',provisioningTitle:'กำลังตรวจสอบการสร้างกล่องอีเมล',provisioningText:'ชื่อนี้จองไว้สำหรับบัญชีคุณแล้ว แต่ยังไม่ยืนยันว่ากล่องพร้อมใช้งาน รออย่างน้อย 30 วินาทีแล้วรีเฟรช หากระบบเปิดให้ลองใหม่ จะตรวจสอบชื่อเดิมโดยไม่สร้างกล่องซ้ำ',retryProvision:'ตรวจสอบการสร้างชื่อเดิม',unavailableName:'สร้างชื่อเดิมไม่สำเร็จ กรุณาเลือกชื่อใหม่'},
  en:{localHint:'3–30 characters: lowercase English letters, numbers, dots, hyphens or underscores. Reserved names are unavailable.',draftHint:'Up to 20 messages per day and 5 recipients per message. Drafts stay on this page. Unconfirmed sends stay in this tab so retries use the original identity.',sentCopyMissing:'The server accepted this email, but its Sent copy could not be saved. Do not send it again.',retrySend:'Check original send result',partial:'Only some recipients were accepted. Not sent to:',provisioningTitle:'Checking mailbox creation',provisioningText:'This name is reserved for your account, but the mailbox is not confirmed ready. Wait at least 30 seconds and refresh. When retry becomes available, it checks the original name without creating a duplicate.',retryProvision:'Check original mailbox creation',unavailableName:'The previous mailbox name could not be created. Choose another name.'}
};
const ACCESS_COPY = {
  th:{readOnly:'ขณะนี้ยังส่งอีเมลใหม่ไม่ได้ ตรวจสอบสถานะบริการแล้วลองอีกครั้ง คุณยังอ่านและจัดการอีเมลเดิมได้'},
  en:{readOnly:'You can read and manage existing email. Sending is currently unavailable. Check the service status and try again.'}
};
const MULTI_COPY = {
  th:{chooseMailbox:'อีเมลที่ใช้งาน',addMailbox:'เพิ่มอีเมล',capacity:'อีเมลที่ใช้งาน',readManageOnly:'อ่านและจัดการเท่านั้น',switchDraft:'เปลี่ยนกล่องและยกเลิกข้อความร่างนี้ใช่ไหม',createText:'ตั้งชื่ออีเมล @taithai.app ของคุณ ตรวจสอบชื่อก่อนยืนยัน ระบบจะไม่สร้างอีเมลให้อัตโนมัติ',draftHint:'ส่งได้สูงสุด 20 ข้อความต่อวันต่ออีเมล ผู้รับไม่เกิน 5 คนต่อข้อความ ร่างอยู่ในหน้านี้ รายการส่งที่รอยืนยันจะใช้กล่องเดิมและรหัสเดิม',sendingFrom:'กล่องที่ใช้ส่ง',mailboxAdded:'เพิ่มอีเมลแล้ว',quotaFull:'ผู้ให้บริการยังไม่มีพื้นที่สำหรับสร้างอีเมลเพิ่ม อีเมลเดิมยังใช้งานได้ตามปกติ'},
  en:{chooseMailbox:'Current email',addMailbox:'Add email',capacity:'Email addresses in use',readManageOnly:'Read and manage only',switchDraft:'Switch mailboxes and discard this draft?',createText:'Choose your own @taithai.app address. Review the name before confirming. No address is created automatically.',draftHint:'Up to 20 messages per day per email address and 5 recipients per message. Drafts stay on this page. Unconfirmed sends retain their original mailbox and request identity.',sendingFrom:'Sending mailbox',mailboxAdded:'Email added',quotaFull:'The email provider has no space for another address. Existing email can still be used.'}
};
const OWNER_COPY = {
  th:{ownerTitle:'อีเมลสำหรับผู้ดูแลเว็บไซต์',ownerText:'บริการอีเมลเปิดให้เจ้าของและผู้ดูแลที่ได้รับสิทธิ์ แต่ละบัญชีเห็นเฉพาะอีเมลของตัวเอง',denied:'บัญชีนี้ยังไม่มีสิทธิ์ใช้อีเมล ติดต่อเจ้าของเว็บไซต์เพื่อขอสิทธิ์ผู้ดูแล',signOut:'ออกจากระบบ',account:'กลับไปบัญชีของฉัน',notReady:'บริการอีเมลยังไม่พร้อม ลองรีเฟรชอีกครั้ง',search:'ค้นหาอีเมลที่โหลดแล้ว',searchHint:'ค้นหาผู้ส่ง หัวข้อ หรือชื่อผู้รับในโฟลเดอร์นี้จากรายการที่โหลดแล้ว',noMatches:'ไม่พบอีเมลที่ตรงกับคำค้น',clearSearch:'ล้างคำค้น',privateMail:'อีเมลส่วนตัวของบัญชีนี้เท่านั้น',stockUnknown:'ยังตรวจสอบพื้นที่ของผู้ให้บริการไม่ได้ จึงพักการสร้างอีเมลใหม่ไว้ก่อน อีเมลเดิมยังใช้งานได้'},
  en:{ownerTitle:'Mail for website administrators',ownerText:'Mail is available to the owner and authorized administrators. Each account sees only its own email.',denied:'This account does not have mail access. Ask the site owner to grant access.',signOut:'Sign out',account:'Back to my account',notReady:'Email service is not ready. Try refreshing.',search:'Search loaded mail',searchHint:'Search senders, subjects and recipient names in the loaded messages of this folder.',noMatches:'No loaded messages match this search',clearSearch:'Clear search',privateMail:'Only this account’s own email is shown',stockUnknown:'Provider availability could not be checked. Creating new addresses is paused; existing email can still be used.'}
};
const ALIAS_COPY={
  th:{aliasTitle:'ชื่ออีเมลเพิ่มเติม (นามแฝง)',aliasText:'สร้างชื่อรับอีเมลเพิ่มเติมได้โดยไม่มีค่าใช้จ่ายเพิ่มภายในโควตาของผู้ให้บริการ ทุกชื่อรับเข้ากล่องหลักนี้ ไม่มีกล่องแยกหรือรหัสเข้าสู่ระบบของตัวเอง',aliasManage:'จัดการชื่อเพิ่มเติม',aliasAlternative:'หากต้องการชื่อรับอีเมลเพิ่ม ให้ใช้นามแฝงที่รับเข้ากล่องเดิมได้โดยไม่ใช้สิทธิ์กล่องแยก',aliasQuota:'โควตาชื่อเพิ่มเติม',aliasLoading:'กำลังตรวจสอบชื่อเพิ่มเติม…',aliasLoadFailed:'ยังโหลดชื่อเพิ่มเติมไม่ได้ คุณยังเปิดอ่านอีเมลได้ ลองตรวจสอบอีกครั้ง',aliasRefresh:'ตรวจสอบชื่อเพิ่มเติม',aliasEmpty:'ยังไม่มีชื่อเพิ่มเติม',aliasLocal:'ตั้งชื่อก่อน @taithai.app',aliasAdd:'เพิ่มชื่ออีเมลฟรี',aliasAddConfirm:'เพิ่มชื่อนี้ให้รับเข้ากล่องหลักใช่ไหม',aliasDelete:'ลบนามแฝง',aliasDeleteTitle:'ยืนยันลบนามแฝง',aliasDeleteHint:'พิมพ์ที่อยู่นามแฝงนี้ให้ครบเพื่อยืนยัน',aliasDeleteNote:'การลบหยุดรับข้อความใหม่ที่ส่งถึงชื่อนี้ อีเมลเก่าที่รับไว้แล้วในกล่องหลักยังอยู่',aliasDeleteConfirm:'ลบนามแฝงนี้ใช่ไหม',aliasCancel:'ยกเลิก',aliasPending:'ยังยืนยันผลรายการนามแฝงไม่ได้ ข้อมูลรายการนี้ถูกล็อกไว้เพื่อให้ตรวจสอบด้วยรหัสเดิม',aliasRetry:'ตรวจสอบรายการนามแฝงเดิม',aliasCreated:'เพิ่มชื่ออีเมลแล้ว',aliasDeleted:'ลบนามแฝงแล้ว',aliasSendNote:'ในหน้าเว็บนี้ อีเมลส่งออกใช้ชื่อหลักของกล่อง',aliasWebmail:'เปิดเว็บเมลของผู้ให้บริการ',aliasInvalid:'ตรวจสอบชื่อที่ต้องการเพิ่มอีกครั้ง',recipientLabel:'ส่งถึงชื่อ',recipientAlias:'นามแฝง',recipientPrimary:'ชื่อหลัก',recipientPrevious:'ชื่อที่เคยใช้',recipientNote:'ชื่อเหล่านี้อ่านจากข้อมูลผู้รับในอีเมล ไม่ใช่การยืนยันเส้นทางส่ง และอาจไม่มีข้อมูลผู้รับแบบสำเนาลับ',recipientUnavailable:'อีเมลนี้ไม่มีข้อมูลที่จับคู่ชื่อผู้รับได้ จึงไม่เดาชื่อปลายทาง'},
  en:{aliasTitle:'Additional email names (aliases)',aliasText:'Add receiving names at no extra charge within the provider’s quota. They all deliver to this primary mailbox, without a separate inbox or login password.',aliasManage:'Manage additional names',aliasAlternative:'For another receiving name, use an alias that delivers to this inbox without using a separate-mailbox slot.',aliasQuota:'Additional-name quota',aliasLoading:'Checking additional names…',aliasLoadFailed:'Additional names could not be loaded. You can still read mail. Check again when ready.',aliasRefresh:'Check additional names',aliasEmpty:'No additional names yet',aliasLocal:'Choose a name before @taithai.app',aliasAdd:'Add a free email name',aliasAddConfirm:'Add this receiving name to the primary mailbox?',aliasDelete:'Delete alias',aliasDeleteTitle:'Confirm alias deletion',aliasDeleteHint:'Type this complete additional address to confirm',aliasDeleteNote:'Deleting stops new mail to this name. Messages already received in the primary inbox remain.',aliasDeleteConfirm:'Delete this alias?',aliasCancel:'Cancel',aliasPending:'This alias request is not confirmed. Its details are locked so you can check it using the original request ID.',aliasRetry:'Check original alias request',aliasCreated:'Additional email name added',aliasDeleted:'Alias deleted',aliasSendNote:'Emails sent from this website use the mailbox’s primary address.',aliasWebmail:'Open provider webmail',aliasInvalid:'Check the additional name and try again.',recipientLabel:'Addressed to',recipientAlias:'alias',recipientPrimary:'primary name',recipientPrevious:'previous name',recipientNote:'These names come from recipient metadata in the message. They do not verify delivery routing and may omit Bcc recipients.',recipientUnavailable:'No matching recipient metadata is available. A destination name is not inferred.'}
};
export function recipientMatches(message){
  if(message?.recipientMatchStatus!=='matched'||!Array.isArray(message.recipientMatches))return [];
  const sources=new Set(['to','cc','delivered-to','x-original-to','envelope-to']),seen=new Set();
  return message.recipientMatches.filter(item=>typeof item?.address==='string'&&item.address.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(item.address)&&['primary','alias','previous'].includes(item.kind)&&Array.isArray(item.sources)&&item.sources.some(source=>sources.has(source))).filter(item=>{const key=item.address.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8).map(item=>({address:item.address,kind:item.kind}));
}
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
export function aliasLocalPart(value){const name=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$/.test(name)||/[._-]{2}/.test(name))throw Object.assign(Error('INVALID_LOCAL_PART'),{code:'INVALID_LOCAL_PART'});return name;}
export function normalizeMailDraft(value) {
  const to = String(value.to || '').trim(), subject = String(value.subject || '').trim(), text = String(value.text || '');
  const recipients = to.split(/[,;\s]+/).filter(Boolean);
  if (!recipients.length || recipients.length > 5 || recipients.some(address => !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address)) || !text.trim() || subject.length > 200 || text.length > 20000 || /[\r\n\u0000]/.test(to + subject) || text.includes('\u0000')) throw Object.assign(Error('INVALID_MESSAGE'),{code:'INVALID_MESSAGE'});
  return {to:recipients.join(', '),subject,text,...(value.inReplyTo ? {inReplyTo:String(value.inReplyTo)} : {})};
}
export function safeReplyAddress(value) { const address = String(value || '').trim();return address.length <= 254 && /^[A-Za-z0-9!#$%&'*+\/?=^_`{|}~.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(address) ? address : ''; }
export function initMailPage({ window: win = globalThis.window, document: doc = win?.document, loadAuth = () => import('/firebase-auth.js?v=20260725-2'), request } = {}) {
  const root = doc?.getElementById('mailPanel'); if (!root || root.dataset.mailInitialized) return null; root.dataset.mailInitialized = 'true';
  const ui = createMemberUi(doc), locale = () => membershipLanguage(win,doc), t = () => ({...COPY[locale()],...LIMIT_COPY[locale()],...ACCESS_COPY[locale()],...MULTI_COPY[locale()],...OWNER_COPY[locale()],...ALIAS_COPY[locale()]}), common = () => membershipText(locale());
  let auth, user = null, checked = false, authFailed = false, authTimer, pollTimer, state = null, loading = false, incomingLoading = false, busy = '', epoch = 0, authGeneration = 0, mailboxRequest = 0, messageRequest = 0, disposed = false, unsubscribe = () => {}, status = null;
  let folders = [], folder = '', messages = [], cursor = null, selected = null, composing = false, draft = {to:'',subject:'',text:''}, pending = null, localPart = '', createAttempt = null, creationAttempts = new Map(), storageBlocked = false, incomingDirty = false, expandedMessages = false, selectedMailboxId = '', preferredMailboxId = '', creatingVisible = false, search = '';
  let aliasesState=null,aliasesLoading=false,aliasesUnavailable=false,aliasBusy='',aliasError='',aliasNotice='',aliasLocal='',aliasPending=null,aliasContext='',aliasSequence=0,aliasesOpen=false,aliasDeletingId='',aliasConfirm='';
  const api = createMembershipApi({getUser:() => user,window:win,request});
  const mailAccess = () => verifiedAccount(user) && state?.mailAccess === true && state?.adminAccess === true;
  const mailReady = () => mailAccess() && state?.mailReady === true;
  const writable = () => (typeof mailbox()?.canSend === 'boolean' ? mailbox().canSend : state?.canSend === true) && mailReady() && state?.capabilities?.mail !== false;
  const canCreate = () => state?.canCreate === true && mailReady() && state?.capabilities?.mail !== false;
  const mailProvider = () => state?.mailProvider || state?.provider || '';
  const localHint = () => mailProvider() === 'hostinger' ? (locale() === 'th' ? '3–30 ตัวอักษร ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข และจุดเท่านั้น ไม่ขึ้นต้นหรือลงท้ายด้วยจุด และไม่ใช้จุดติดกัน ชื่อสงวนอาจใช้ไม่ได้' : '3–30 characters: lowercase English letters, numbers and dots only. No leading, trailing or consecutive dots. Reserved names are unavailable.') : t().localHint;
  const canManage = () => Boolean(mailbox()) && (typeof mailbox()?.canManageMessages === 'boolean' ? mailbox().canManageMessages : state?.canManageMessages !== false) && state?.capabilities?.mail !== false;
  const boxes = () => mailAccess() && Array.isArray(state?.mailboxes) ? state.mailboxes : [];
  const mailbox = () => boxes().find(box => box.id === selectedMailboxId) || boxes()[0];
  const pendingBoxes = () => !mailAccess() ? [] : Array.isArray(state?.pendingMailboxes) ? state.pendingMailboxes : state?.mailbox?.status === 'provisioning' ? [{...state.mailbox,canRetryProvisioning:state.canRetryProvisioning}] : [];
  function resetAliases(){aliasesState=null;aliasesLoading=false;aliasesUnavailable=false;aliasBusy='';aliasError='';aliasNotice='';aliasLocal='';aliasPending=null;aliasContext='';aliasDeletingId='';aliasConfirm='';aliasSequence++;}
  function resetMailboxView() {search = '';folders = [];folder = '';messages = [];cursor = null;selected = null;expandedMessages = false;incomingDirty = false;mailboxRequest++;messageRequest++;resetAliases();}
  function reconcileMailbox() {
    const preferred = preferredMailboxId || selectedMailboxId || pending?.payload?.mailbox;
    const next = boxes().find(box => box.id === preferred)?.id || boxes()[0]?.id || '';
    if (selectedMailboxId !== next) resetMailboxView();selectedMailboxId = next;preferredMailboxId = '';
  }
  const storageKey = () => `taithai.mail.pending.v1:${user?.uid || ''}`;
  const creationKey = () => `taithai.mail.provision.v1:${user?.uid || ''}`;
  const aliasKey=()=>`taithai.mail.alias.pending.v1:${user?.uid||''}:${mailbox()?.id||''}`;
  function saveAliasPending(){try{if(aliasPending)win.sessionStorage.setItem(aliasKey(),JSON.stringify(aliasPending));else win.sessionStorage.removeItem(aliasKey());}catch{storageBlocked=true;}}
  function aliasScope(){
    const key=mailAccess()&&mailbox()?aliasKey():'';if(key===aliasContext)return;resetAliases();aliasContext=key;if(!key)return;
    try{const item=JSON.parse(win.sessionStorage.getItem(key)||'null');if(!item||!['alias-create','alias-delete'].includes(item.action)||typeof item.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(item.requestId)||item.data?.mailbox!==mailbox().id)return;
      if(item.action==='alias-create')aliasLocalPart(item.data.localPart);else if(typeof item.data.aliasId!=='string'||typeof item.data.confirmAddress!=='string')return;
      aliasPending=item;if(item.action==='alias-create')aliasLocal=item.data.localPart;aliasesOpen=true;
    }catch{/* Invalid local metadata never becomes an automatic provider request. */}
  }
  function aliasFailure(error){
    if(error?.status===401||error?.code==='MAIL_ACCESS_REQUIRED'||error?.code==='ADMIN_PERMISSION_REQUIRED'){state=null;resetMailboxView();render();return membershipError(error,locale(),win.navigator?.onLine!==false);}
    return error?.code==='INVALID_LOCAL_PART'?t().aliasInvalid:membershipError(error,locale(),win.navigator?.onLine!==false);
  }
  function acceptAliases(result,target){if(!result||result.mailboxId!==target||!Array.isArray(result.aliases)||result.aliases.length>1000||result.aliases.some(item=>typeof item?.id!=='string'||!item.id||item.id.length>256||!safeReplyAddress(item.address)||!item.address.toLowerCase().endsWith('@taithai.app'))||!['limit','used','available'].every(key=>Number.isSafeInteger(result[key])&&result[key]>=0)||typeof result.canCreate!=='boolean'||typeof result.canDelete!=='boolean')throw Object.assign(Error('MAIL_ALIAS_STATE_UNAVAILABLE'),{code:'MAIL_ALIAS_STATE_UNAVAILABLE',deliveryUnknown:true});aliasesState=result;aliasesUnavailable=false;}
  function updateAliasPanel(){
    const current=doc.getElementById('mailAliasesPanel');if(!current||!mailAccess()||!mailbox()){render();return;}
    const focused=doc.activeElement,focusId=['mailAliasName','mailAliasDeleteConfirm'].includes(focused?.id)?focused.id:null,start=focused?.selectionStart,end=focused?.selectionEnd,next=renderAliases();current.replaceChildren(...Array.from(next.children));current.setAttribute('aria-busy',next.getAttribute('aria-busy'));
    if(focusId){const input=doc.getElementById(focusId);if(input&&!input.disabled){input.focus();if(typeof start==='number')input.setSelectionRange?.(start,end);}}
  }
  async function loadAliases(){
    if(!mailAccess()||!mailbox()||aliasesLoading||aliasBusy||disposed)return;aliasScope();const current=epoch,target=mailbox().id,sequence=++aliasSequence;aliasesLoading=true;aliasError='';updateAliasPanel();
    try{const value=await api.aliases({mailbox:target});if(disposed||current!==epoch||sequence!==aliasSequence||mailbox()?.id!==target)return;acceptAliases(value,target);}
    catch(error){if(!disposed&&current===epoch&&sequence===aliasSequence&&mailbox()?.id===target){aliasesUnavailable=true;aliasError=aliasFailure(error);}}
    finally{if(!disposed&&current===epoch&&sequence===aliasSequence&&mailbox()?.id===target){aliasesLoading=false;updateAliasPanel();}}
  }
  async function createAlias(){
    if(!mailAccess()||!mailbox()||aliasBusy||aliasPending||!aliasesState?.canCreate||aliasesUnavailable)return;
    let name;try{name=aliasLocalPart(aliasLocal);}catch(error){aliasError=aliasFailure(error);render();return;}
    const address=name+'@taithai.app';if(!win.confirm(`${t().aliasAddConfirm}\n${address}\n${mailbox().address}`))return;
    aliasPending={action:'alias-create',requestId:win.crypto.randomUUID(),data:{mailbox:mailbox().id,localPart:name}};saveAliasPending();await executeAlias();
  }
  async function deleteAlias(record){
    if(!mailAccess()||!mailbox()||aliasBusy||aliasPending||aliasesState?.canDelete!==true)return;
    const address=String(record.address||'');if(aliasConfirm.trim().toLowerCase()!==address.toLowerCase())return;
    if(!win.confirm(`${t().aliasDeleteConfirm}\n${address}\n${t().aliasDeleteNote}`))return;
    aliasPending={action:'alias-delete',requestId:win.crypto.randomUUID(),data:{mailbox:mailbox().id,aliasId:record.id,confirmAddress:address}};saveAliasPending();await executeAlias();
  }
  async function executeAlias(){
    const job=aliasPending;if(!job||aliasBusy||!mailAccess()||mailbox()?.id!==job.data.mailbox)return;
    const current=epoch,target=job.data.mailbox;aliasBusy=job.action;aliasError='';aliasNotice='';updateAliasPanel();
    try{const result=job.action==='alias-create'?await api.createAlias({...job.data,requestId:job.requestId}):await api.deleteAlias({...job.data,requestId:job.requestId});if(disposed||current!==epoch||mailbox()?.id!==target)return;acceptAliases(result,target);const confirmed=job.action==='alias-create'?result.aliases.some(item=>item.address.toLowerCase()===job.data.localPart+'@taithai.app'):!result.aliases.some(item=>item.id===job.data.aliasId||item.address.toLowerCase()===job.data.confirmAddress.toLowerCase());if(!confirmed)throw Object.assign(Error('MAIL_ALIAS_STATE_UNAVAILABLE'),{code:'MAIL_ALIAS_STATE_UNAVAILABLE',deliveryUnknown:true});aliasPending=null;saveAliasPending();aliasLocal='';aliasDeletingId='';aliasConfirm='';aliasNotice=job.action==='alias-create'?t().aliasCreated:t().aliasDeleted;}
    catch(error){if(!disposed&&current===epoch&&mailbox()?.id===target){aliasError=aliasFailure(error);if(error.code==='MAIL_ALIAS_LIMIT_REACHED'&&aliasesState)aliasesState={...aliasesState,canCreate:false,available:0};if(!error.deliveryUnknown&&![500,502,503].includes(error.status)&&!['MAIL_ALIAS_PROVISIONING_UNCERTAIN','MAIL_ALIAS_DELETE_UNCERTAIN','OPERATION_IN_PROGRESS','REQUEST_ID_CONFLICT'].includes(error.code)){aliasPending=null;saveAliasPending();}}}
    finally{if(!disposed&&current===epoch&&mailbox()?.id===target){aliasBusy='';updateAliasPanel();}}
  }
  function saveCreation() {try {if (creationAttempts.size) win.sessionStorage.setItem(creationKey(),JSON.stringify({attempts:[...creationAttempts.values()]}));else win.sessionStorage.removeItem(creationKey());}catch {/* Backend reconciles the reserved name even without browser storage. */}}
  function savePending() { try { if (pending) win.sessionStorage.setItem(storageKey(),JSON.stringify(pending)); else win.sessionStorage.removeItem(storageKey()); } catch { storageBlocked = true; } }
  function restorePending() { pending = null; try { const value = JSON.parse(win.sessionStorage.getItem(storageKey()) || 'null'); if (value && /^[A-Za-z0-9_-]{16,100}$/.test(value.requestId || '') && value.payload && typeof value.payload.text === 'string' && (!value.payload.mailbox || typeof value.payload.mailbox === 'string' && value.payload.mailbox.length <= 256)) { normalizeMailDraft(value.payload); pending = value; draft = {...value.payload}; composing = true; } } catch { storageBlocked = true; } }
  function mailError(error) {if([401,403].includes(error?.status)){state=null;resetMailboxView();render();}return membershipError(error,locale(),win.navigator?.onLine !== false);}
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
    render();void refreshMailbox();void loadAliases();scheduleIncoming();return true;
  }
  function renderMailboxManagement() {
    const text = t(),panel = ui.panel(text.chooseMailbox);panel.classList.add('mailbox-management');
    const used = Number.isInteger(Number(state.mailboxUsed)) ? Number(state.mailboxUsed) : boxes().length + pendingBoxes().length;
    panel.append(ui.el('p',text.capacity + ' · ' + used,'mailbox-capacity'));
    if (boxes().length) {
      const input = ui.el('select');input.id = 'mailboxSelector';input.disabled = Boolean(busy && busy !== 'read');
      for (const box of boxes()) {const option = ui.el('option',(box.address || box.id) + (box.canSend === false ? ' · ' + text.readManageOnly : ''));option.value = box.id;option.selected = box.id === mailbox()?.id;input.append(option);}
      input.value = mailbox().id;input.addEventListener('change',() => {if (!switchMailbox(input.value)) input.value = mailbox()?.id || '';});const control = ui.field(text.chooseMailbox,input);control.classList.add('mail-account-control');panel.append(control);
    }
    const actions = ui.el('div',undefined,'button-row');
    actions.append(ui.button(text.addMailbox,() => {creatingVisible = !creatingVisible;render();doc.getElementById('mailboxName')?.focus();},{primary:true,disabled:!canCreate() || Boolean(busy)}));
    panel.append(actions);
    if (!canCreate()) panel.append(ui.el('p',state.capacityAvailable === false ? text.stockUnknown : text.quotaFull,'small'));
    if(mailbox()){panel.append(ui.el('p',text.aliasAlternative,'small'));const aliasAction=ui.button(text.aliasManage,()=>{aliasesOpen=!aliasesOpen;render();if(aliasesOpen&&!aliasesState&&!aliasesLoading)void loadAliases();if(aliasesOpen)doc.getElementById('mailAliasName')?.focus();},{disabled:Boolean(aliasBusy)});actions.append(aliasAction);panel.append(renderAliases());}
    const reservations = pendingBoxes();
    if (reservations.length) {
      const list = ui.el('div',undefined,'mailbox-pending-list');
      for (const item of reservations) {
        const pendingPanel = ui.panel(text.provisioningTitle,text.provisioningText);pendingPanel.append(ui.el('p',item.address || '', 'membership-address'));
        const controls = ui.el('div',undefined,'button-row');controls.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}),ui.button(text.retryProvision,() => createMailbox(item.localPart,item.id),{disabled:item.canRetryProvisioning !== true || !mailReady() || Boolean(busy)}));pendingPanel.append(controls);list.append(pendingPanel);
      }
      panel.append(list);
    }
    return panel;
  }
  function renderAliases(){
    aliasScope();const text=t(),section=ui.el('section',undefined,'mail-aliases');section.id='mailAliasesPanel';section.setAttribute('aria-busy',String(aliasesLoading||Boolean(aliasBusy)));
    section.append(ui.el('h3',text.aliasTitle));if(!aliasesOpen)return section;
    section.append(ui.el('p',text.aliasText,'small'));
    if(aliasesLoading)section.append(ui.el('p',text.aliasLoading,'small'));
    if(aliasError){const note=ui.el('p',aliasError,'notice notice-error');note.setAttribute('role','alert');section.append(note);}
    if(aliasNotice){const note=ui.el('p',aliasNotice,'notice');note.setAttribute('role','status');section.append(note);}
    const controls=ui.el('div',undefined,'button-row');controls.append(ui.button(text.aliasRefresh,loadAliases,{disabled:aliasesLoading||Boolean(aliasBusy)}));
    if(aliasesState?.webmailUrl==='https://mail.hostinger.com'){const provider=ui.link(text.aliasWebmail,aliasesState.webmailUrl);provider.target='_blank';provider.rel='noopener noreferrer';provider.referrerPolicy='no-referrer';controls.append(provider);}section.append(controls);
    if(aliasPending){const pendingPanel=ui.el('div',undefined,'notice');pendingPanel.append(ui.el('p',text.aliasPending));const address=aliasPending.action==='alias-create'?aliasPending.data.localPart+'@taithai.app':aliasPending.data.confirmAddress;pendingPanel.append(ui.el('p',address,'membership-address'),ui.button(aliasBusy?text.busy:text.aliasRetry,executeAlias,{primary:true,disabled:Boolean(aliasBusy)}));section.append(pendingPanel);}
    if(!aliasesState)return section;
    const count=Number.isSafeInteger(aliasesState.used)&&Number.isSafeInteger(aliasesState.limit)?`${aliasesState.used} / ${aliasesState.limit}`:'';if(count)section.append(ui.el('p',text.aliasQuota+' · '+count,'mail-alias-quota'));
    const list=ui.el('div',undefined,'mail-alias-list');for(const record of aliasesState.aliases){if(typeof record?.id!=='string'||typeof record.address!=='string')continue;const row=ui.el('article',undefined,'mail-alias-row');row.append(ui.el('p',record.address,'membership-address'));if(record.createdAt)row.append(ui.el('p',memberDate(record.createdAt,locale()),'small'));
      if(aliasDeletingId===record.id){const form=ui.el('form');form.id='mailAliasDeleteForm';const input=ui.el('input');input.type='email';input.id='mailAliasDeleteConfirm';input.autocomplete='off';input.maxLength=254;input.required=true;input.value=aliasConfirm;input.disabled=Boolean(aliasBusy)||Boolean(aliasPending);const submit=ui.el('button',aliasBusy==='alias-delete'?text.busy:text.aliasDelete,'button button-danger');submit.type='submit';submit.disabled=input.disabled||aliasConfirm.trim().toLowerCase()!==record.address.toLowerCase();input.addEventListener('input',()=>{aliasConfirm=input.value;submit.disabled=Boolean(aliasBusy)||Boolean(aliasPending)||aliasConfirm.trim().toLowerCase()!==record.address.toLowerCase();});form.append(ui.field(text.aliasDeleteHint,input,record.address),ui.el('p',text.aliasDeleteNote,'small'));const actions=ui.el('div',undefined,'button-row');actions.append(submit,ui.button(text.aliasCancel,()=>{aliasDeletingId='';aliasConfirm='';render();},{disabled:Boolean(aliasBusy)}));form.append(actions);form.addEventListener('submit',event=>{event.preventDefault();void deleteAlias(record);});row.append(form);
      }else row.append(ui.button(text.aliasDelete,()=>{aliasDeletingId=record.id;aliasConfirm='';aliasError='';render();doc.getElementById('mailAliasDeleteConfirm')?.focus();},{danger:true,disabled:aliasesState.canDelete!==true||Boolean(aliasBusy)||Boolean(aliasPending)}));list.append(row);
    }if(!aliasesState.aliases.length)list.append(ui.el('p',text.aliasEmpty,'muted'));section.append(list);
    if(aliasesState.canCreate===true){const form=ui.el('form');form.id='mailAliasCreateForm';const input=ui.el('input');input.id='mailAliasName';input.type='text';input.autocomplete='off';input.autocapitalize='none';input.spellcheck=false;input.minLength=3;input.maxLength=50;input.pattern=String.raw`(?!.*[._\-]{2})[a-z0-9][a-z0-9._\-]{1,48}[a-z0-9]`;input.required=true;input.value=aliasLocal;input.disabled=Boolean(aliasBusy)||Boolean(aliasPending)||aliasesUnavailable;input.addEventListener('input',()=>{aliasLocal=input.value;if(!aliasesUnavailable)aliasError='';});const hint=locale()==='th'?'3–50 ตัวอักษร ใช้ a–z ตัวเลข จุด _ หรือ - ไม่ขึ้นต้นหรือลงท้ายด้วยเครื่องหมาย และไม่ใช้เครื่องหมายติดกัน':'3–50 lowercase letters, numbers, dots, _ or -. No leading, trailing or consecutive separators.';form.append(ui.field(text.aliasLocal,input,hint));const submit=ui.el('button',aliasBusy==='alias-create'?text.busy:text.aliasAdd,'button button-primary');submit.type='submit';submit.disabled=input.disabled;form.append(submit);form.addEventListener('submit',event=>{event.preventDefault();void createAlias();});section.append(form);}
    section.append(ui.el('p',text.aliasSendNote,'small'));return section;
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
    if (!verifiedAccount(user)) { const gate = ui.panel(text.ownerTitle,text.denied);gate.append(ui.button(text.signOut,signOut,{disabled:Boolean(busy)}),ui.link(text.account,'https://taithai.app/account/'));root.append(gate);return; }
    if (!state) { root.append(ui.panel('',loading ? text.loading : text.loadFailed)); if (!loading) root.append(ui.button(base.retry,refresh),ui.button(text.signOut,signOut,{disabled:Boolean(busy)})); return; }
    if (!mailAccess()) { const gate = ui.panel(text.ownerTitle,text.denied); gate.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}),ui.button(text.signOut,signOut,{disabled:Boolean(busy)}),ui.link(text.account,'https://taithai.app/account/'));root.append(gate);return; }
    const identity = ui.el('div',undefined,'mail-toolbar');identity.append(ui.el('p',user.email || '', 'membership-identity'),ui.button(text.signOut,signOut,{disabled:Boolean(busy)}));root.append(identity,ui.el('p',text.privateMail,'small'));
    if (!mailReady()) root.append(ui.panel('',text.notReady));
    if (boxes().length || pendingBoxes().length) root.append(renderMailboxManagement());
    if (!mailbox()) {
      if (pending) root.append(renderCompose());
      if (state.mailbox?.status === 'unavailable') root.append(ui.panel('',text.unavailableName));
      if (canCreate()) root.append(renderCreation());
      else if (!pendingBoxes().length) root.append(ui.panel('',text.noMailbox));
      if (!canCreate() && !pendingBoxes().length && mailReady()) root.append(ui.panel('',state.capacityAvailable === false ? text.stockUnknown : text.quotaFull));
      root.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)})); return;
    }
    if (creatingVisible && canCreate()) root.append(renderCreation());
    if (!writable()) root.append(ui.panel('',text.readOnly));
    const head = ui.el('div',undefined,'mail-toolbar'); head.append(ui.el('p',mailbox().address || '', 'membership-address'));
    const actions = ui.el('div',undefined,'button-row'); actions.append(ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}),ui.button(text.compose,() => {composing = true; render(); doc.getElementById('mailTo')?.focus();},{primary:true,disabled:!writable() || Boolean(busy) || Boolean(pending)})); head.append(actions); root.append(head);
    if (composing || pending) root.append(renderCompose());
    const workspace = ui.el('div',undefined,'mail-workspace');
    const folderNav = ui.el('nav',undefined,'mail-folders panel'); folderNav.setAttribute('aria-label',text.folders); folderNav.append(ui.el('h2',text.folders));
    for (const item of folders) { const row = ui.button(folderName(item),() => selectFolder(item.id),{disabled:loading || Boolean(busy)}); row.classList.add('mail-folder'); row.setAttribute('aria-current',item.id === folder ? 'page' : 'false'); if (Number(item.unread) > 0) row.append(ui.el('span',String(item.unread),'mail-unread-count')); folderNav.append(row); }
    workspace.append(folderNav);
    const list = ui.el('section',undefined,'mail-message-list panel'); list.setAttribute('aria-label',folders.find(item => item.id === folder) ? folderName(folders.find(item => item.id === folder)) : text.all);
    list.append(ui.el('h2',folders.find(item => item.id === folder) ? folderName(folders.find(item => item.id === folder)) : text.all));
    const searchField = ui.el('input');searchField.id = 'mailSearch';searchField.type = 'search';searchField.value = search;searchField.autocomplete = 'off';searchField.maxLength = 200;
    const searchControls = ui.el('div',undefined,'mail-search-controls');const searchRows = ui.el('div',undefined,'mail-search-results');searchRows.setAttribute('aria-live','polite');
    const clear = ui.button(text.clearSearch,()=>{search='';searchField.value='';renderMessageRows(searchRows);searchField.focus();});clear.disabled=!search;
    searchField.addEventListener('input',()=>{search=searchField.value;clear.disabled=!search;renderMessageRows(searchRows);});searchControls.append(ui.field(text.search,searchField,text.searchHint),clear);list.append(searchControls,searchRows);renderMessageRows(searchRows);
    if (cursor) list.append(ui.button(text.more,() => loadMessages(true),{disabled:loading || Boolean(busy)})); workspace.append(list);
    const detail = ui.el('section',undefined,'mail-reader panel'); detail.setAttribute('aria-label',text.body);
    if (!selected) detail.append(ui.el('p',text.emptyDetail,'muted'));
    else {
      detail.append(ui.el('h2',selected.subject || text.subjectEmpty)); const meta = ui.el('dl',undefined,'mail-message-meta');
      for (const [label,value] of [[text.from,selected.from],[locale() === 'th' ? 'ตอบกลับไปยัง' : 'Reply to',safeReplyAddress(selected.replyToAddress)],[text.to,selected.to],[text.cc,selected.cc],[text.date,memberDate(selected.date,locale())]]) if (value) meta.append(ui.el('dt',label),ui.el('dd',value));
      const matched=recipientMatches(selected);for(const item of matched)meta.append(ui.el('dt',text.recipientLabel),ui.el('dd',recipientName(item)));detail.append(meta,ui.el('p',matched.length?text.recipientNote:text.recipientUnavailable,'mail-recipient-note small'));
      const controls = ui.el('div',undefined,'button-row'); controls.append(ui.button(text.reply,reply,{disabled:!writable() || Boolean(busy) || Boolean(pending) || !safeReplyAddress(selected.replyToAddress)}),ui.button(selected.unread ? text.markRead : text.markUnread,() => changeFlags({read:Boolean(selected.unread)}),{disabled:!canManage() || Boolean(busy)}),ui.button(text.moveTrash,trash,{danger:true,disabled:!canManage() || Boolean(busy)})); detail.append(controls);
      const body = ui.el('div',undefined,'mail-message-body'); appendMailText(body,selected.text,doc); detail.append(body,ui.el('p',text.plain,'small'));
      if (selected.attachments?.length) { const attachments = ui.el('section',undefined,'mail-attachments'); attachments.append(ui.el('h3',text.attachments)); const names = ui.el('ul'); for (const attachment of selected.attachments) names.append(ui.el('li',`${attachment.filename || attachment.name || 'Attachment'}${Number.isFinite(attachment.size) ? ` · ${new Intl.NumberFormat(locale()).format(attachment.size)} B` : ''}`)); attachments.append(names,ui.el('p',text.attachmentNote,'small')); detail.append(attachments); }
    }
    workspace.append(detail); root.append(workspace);
  }
  function recipientName(item){return item.address+' · '+({primary:t().recipientPrimary,alias:t().recipientAlias,previous:t().recipientPrevious}[item.kind]||'');}
  function renderMessageRows(container) {
    const text=t(),query=search.trim().toLocaleLowerCase(),filtered=messages.filter(message=>!query||[message.from,message.subject,message.preview,...recipientMatches(message).map(item=>item.address)].some(value=>String(value || '').toLocaleLowerCase().includes(query)));
    container.replaceChildren();if(!filtered.length)container.append(ui.el('p',loading?text.loading:query?text.noMatches:text.empty,'muted'));
    for(const message of filtered){const row=ui.el('button',undefined,`mail-message${message.unread?' is-unread':''}`);row.type='button';row.disabled=Boolean(busy);row.setAttribute('aria-current',selected?.id===message.id?'true':'false');row.append(ui.el('span',message.from || '','mail-message-from'),ui.el('strong',message.subject || text.subjectEmpty,'mail-message-subject'),ui.el('time',memberDate(message.date,locale()),'mail-message-date'));const matched=recipientMatches(message);for(const item of matched)row.append(ui.el('span',text.recipientLabel+': '+recipientName(item),'mail-recipient-match'));if(message.preview)row.append(ui.el('span',message.preview,'mail-message-preview'));if(message.unread)row.setAttribute('aria-label',`${message.subject || text.subjectEmpty} · ${text.markRead}${matched.length?' · '+text.recipientLabel+': '+matched.map(recipientName).join(', '):''}`);row.addEventListener('click',()=>openMessage(message.id));container.append(row);}
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
    if (!verifiedAccount(user) || loading || busy || disposed) return; const current = epoch; loading = true; status = null; render();
    try { const result = await api.call('status'); if (disposed || current !== epoch) return; state = result;reconcileMailbox(); }
    catch (error) { if (!disposed && current === epoch) {state = null;resetMailboxView();notice(mailError(error),true);} }
    finally { if (!disposed && current === epoch) { loading = false; render(); if (mailbox()) {void refreshMailbox();void loadAliases();scheduleIncoming();} } }
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
    } catch (error) {if (current === epoch && !disposed && (!silent || [401,403].includes(error?.status))) notice(mailError(error),true);}
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
    if (disposed || !user || !mailbox() || loading || incomingLoading || busy || composing || pending || expandedMessages || doc.hidden === true || win.navigator?.onLine === false || state?.capabilities?.mail === false || doc.activeElement?.id === 'mailSearch' || win.getSelection?.()?.isCollapsed === false) return Promise.resolve();
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
    catch (error) { if (current === epoch && !disposed) notice(mailError(error),true); }
    finally { if (!disposed && current === epoch && sequence === mailboxRequest) { loading = false; render(); } }
  }
  function selectFolder(id) { if (id === folder || loading || busy) return; folder = id; search = '';selected = null; messages = []; cursor = null;expandedMessages = false; messageRequest++; void loadMessages(); }
  async function openMessage(id) {
    if (!mailbox() || busy) return; const current = epoch, sequence = ++messageRequest; busy = 'read'; render();
    try { const result = await api.call('message',{params:{mailbox:mailbox().id,id}}); if (current !== epoch || sequence !== messageRequest || disposed) return; selected = result.message; }
    catch (error) { if (current === epoch && !disposed) notice(mailError(error),true); }
    finally { if (current === epoch && sequence === messageRequest && !disposed) { busy = ''; render(); } }
  }
  async function createMailbox(recoveryName,recoveryId) {
    const reservation = pendingBoxes().find(item => recoveryId ? item.id === recoveryId : item.localPart === recoveryName);
    const retry = Boolean(reservation && reservation.canRetryProvisioning === true && recoveryName === reservation.localPart && mailReady());
    if ((!canCreate() && !retry) || busy) return;
    let name; try { name = mailboxLocalPart(retry ? reservation.localPart : localPart,mailProvider()); } catch (error) {notice(mailError(error),true);render();return;}
    if (!win.confirm(`${t().createConfirm}\n${name}@taithai.app`)) return;
    createAttempt = creationAttempts.get(name) || {localPart:name,requestId:win.crypto.randomUUID()};creationAttempts.set(name,createAttempt);saveCreation();
    const current = epoch; busy = 'create'; status = null; render();
    try { const result = await api.call('mailbox-create',{method:'POST',data:createAttempt}); if (current !== epoch || disposed) return;if (result.createdMailbox?.status === 'active') preferredMailboxId = result.createdMailbox.id;notice(t().mailboxAdded);creationAttempts.delete(name);createAttempt = null;creatingVisible = false;localPart = '';saveCreation(); }
    catch (error) { if (current === epoch && !disposed) notice(mailError(error),true); }
    finally { if (current === epoch && !disposed) { busy = ''; render(); void refresh(); } }
  }
  function reply() { const recipient = safeReplyAddress(selected?.replyToAddress);if (!selected || !recipient || pending || !writable()) return; if ((draft.text || draft.to || draft.subject) && !win.confirm(t().discardConfirm)) return; draft = {to:recipient,subject:/^re:/i.test(selected.subject || '') ? selected.subject : `Re: ${selected.subject || ''}`,text:'',inReplyTo:selected.id}; composing = true; render(); doc.getElementById('mailBody')?.focus(); }
  function discard() { if (busy || (pending || draft.text || draft.to || draft.subject) && !win.confirm(pending ? t().pendingDiscardConfirm : t().discardConfirm)) return; pending = null; savePending(); draft = {to:'',subject:'',text:''}; composing = false; render(); }
  async function send() {
    if (!mailAccess() || busy || !pending && (!writable() || !mailbox())) return;
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
      if (certainFailure) {pending = null;savePending();notice(mailError(error),true);}
      else notice(`${t().sendPending} · ${mailError(error)}`,true);
    } }
    finally { if (current === epoch && !disposed) { busy = ''; render(); } }
  }
  async function changeFlags(flags) {
    if (!selected || !canManage() || busy) return; const current = epoch, id = selected.id; busy = 'flags'; status = null; render();
    try { await api.call('message-flags',{method:'POST',data:{mailbox:mailbox().id,id,...flags}}); if (current !== epoch || disposed) return; if (flags.trash) { messages = messages.filter(item => item.id !== id); selected = null; } else { selected = {...selected,unread:!flags.read}; messages = messages.map(item => item.id === id ? {...item,unread:!flags.read} : item); } }
    catch (error) { if (current === epoch && !disposed) notice(mailError(error),true); }
    finally { if (current === epoch && !disposed) { busy = ''; render(); } }
  }
  function trash() { if (win.confirm(t().trashConfirm)) void changeFlags({trash:true}); }
  async function signOut() { if (busy || !auth?.logout) return;if (!pending && (draft.text || draft.to || draft.subject) && !win.confirm(t().discardConfirm)) return;busy = 'logout';render();try {await auth.logout();}catch (error) {notice(mailError(error),true);}finally {busy = '';render();} }
  async function signIn() { if (busy) return; busy = 'login'; render(); try { await auth.loginWithGoogle(); } catch (error) {notice(mailError(error),true);} finally {busy = '';render();} }
  async function start() {
    const current = ++authGeneration; epoch++; checked = false;authFailed = false;win.clearTimeout(authTimer);render();
    authTimer = win.setTimeout(() => {if (!disposed && current === authGeneration && !checked) {checked = true;authFailed = true;notice(common().auth,true);render();}},12000);
    try {
      auth = await loadAuth(); if (disposed || current !== authGeneration) return; unsubscribe();
      unsubscribe = auth.subscribeAuth(value => {
        if (disposed || current !== authGeneration) return;
        win.clearTimeout(authTimer);win.clearTimeout(pollTimer);authFailed = false;api.abort();epoch++;user = value;checked = true;state = null;loading = false;incomingLoading = false;busy = '';
        folders = [];messages = [];selected = null;cursor = null;expandedMessages = false;folder = '';pending = null;composing = false;draft = {to:'',subject:'',text:''};status = null;createAttempt = null;creationAttempts = new Map();selectedMailboxId = '';preferredMailboxId = '';creatingVisible = false;localPart = '';resetAliases();aliasesOpen=false;
        if (verifiedAccount(user)) {
          restorePending();
          try {
            const saved = JSON.parse(win.sessionStorage.getItem(creationKey()) || 'null'),attempts = Array.isArray(saved?.attempts) ? saved.attempts : saved ? [saved] : [];
            for (const attempt of attempts) if (/^[A-Za-z0-9_-]{16,100}$/.test(attempt.requestId || '')) {mailboxLocalPart(attempt.localPart);creationAttempts.set(attempt.localPart,attempt);}
          } catch {/* Ignore a damaged, optional retry record. */}
        }
        render();if (verifiedAccount(user)) void refresh();
      });
    }
    catch (error) { if (!disposed && current === authGeneration) {win.clearTimeout(authTimer);checked = true;authFailed = true;notice(mailError(error),true);render();} }
  }
  function suspend() {authGeneration++;epoch++;win.clearTimeout(authTimer);win.clearTimeout(pollTimer);api.abort();unsubscribe();unsubscribe = () => {};user = null;state = null;messages = [];selected = null;folders = [];draft = {to:'',subject:'',text:''};pending = null;composing = false;selectedMailboxId = '';preferredMailboxId = '';creatingVisible = false;creationAttempts = new Map();checked = false;loading = false;incomingLoading = false;busy = '';resetAliases();aliasesOpen=false;render();}
  function beforeUnload(event) { if (composing && (draft.text || draft.to || draft.subject) && !pending) {event.preventDefault();event.returnValue = '';} }
  const preferences = () => render(), restore = event => {if (event.persisted) void start();};
  win.addEventListener('taithai:preferences',preferences);win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',restore);win.addEventListener('beforeunload',beforeUnload);win.addEventListener('focus',wakeIncoming);win.addEventListener('online',wakeIncoming);doc.addEventListener('visibilitychange',wakeIncoming);void start();
  return {refresh,destroy(){disposed = true;authGeneration++;epoch++;win.clearTimeout(authTimer);win.clearTimeout(pollTimer);api.abort();unsubscribe();win.removeEventListener('taithai:preferences',preferences);win.removeEventListener('pagehide',suspend);win.removeEventListener('pageshow',restore);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('focus',wakeIncoming);win.removeEventListener('online',wakeIncoming);doc.removeEventListener('visibilitychange',wakeIncoming);delete root.dataset.mailInitialized;}};
}
if (typeof window !== 'undefined' && document.body?.dataset.page === 'mail') initMailPage();
