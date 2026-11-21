/* Membership UI: payment status is always supplied by the authenticated server. */
const AUTH_MODULE = '/firebase-auth.js?v=20260725-2';
const MESSAGES = {
  th: { loading:'กำลังตรวจสอบสมาชิก…', retry:'โหลดอีกครั้ง', signIn:'เข้าสู่ระบบด้วย Google', signInText:'ใช้บัญชี Google เพื่อสมัครสมาชิกและจัดการอีเมลของคุณ', plan:'สมาชิก Taithai', price:'99 บาท / เดือน', includes:'สมาชิก Taithai พร้อมอีเมล @taithai.app และฟีเจอร์ใหม่ที่จะทยอยเพิ่มในอนาคต', recurring:'ชำระรายเดือนแบบต่ออายุอัตโนมัติ จัดการหรือยกเลิกการต่ออายุได้ผ่านหน้าจัดการการชำระเงิน', account:'บัญชีที่ใช้งาน', status:'สถานะสมาชิก', active:'ใช้งานได้', trialing:'ช่วงทดลองใช้', past_due:'รอชำระเงิน', canceled:'ยกเลิกแล้ว', incomplete:'การชำระเงินยังไม่สมบูรณ์', unpaid:'ยังไม่ชำระเงิน', paused:'พักการสมัคร', none:'ยังไม่ได้สมัครสมาชิก', subscribe:'สมัครสมาชิก', managing:'กำลังเปิด…', manage:'จัดการสมาชิก', inbox:'ไปยังอีเมล', discount:'รหัสส่วนลด (ถ้ามี)', discountHint:'ตรวจสอบยอดและเงื่อนไขจริงอีกครั้งบนหน้าชำระเงินก่อนยืนยัน', setup:'บริการยังไม่พร้อมรับสมัคร', setupText:'เจ้าของเว็บไซต์กำลังตั้งค่าระบบชำระเงินและอีเมล ปุ่มชำระเงินจะเปิดเมื่อระบบพร้อม', test:'โหมดทดสอบ', testText:'ระบบชำระเงินนี้อยู่ในโหมดทดสอบ การชำระเงินทดสอบไม่ใช่การสมัครใช้งานจริง', renewal:'รอบปัจจุบันสิ้นสุด', canceling:'ตั้งค่าให้หยุดต่ออายุเมื่อจบรอบปัจจุบันแล้ว', currentMail:'อีเมลของคุณ', noMailbox:'เมื่อสมาชิกใช้งานได้แล้ว คุณจะเลือกชื่อกล่องอีเมลได้ในหน้าอีเมล', unknown:'ยังไม่มีข้อมูล', refreshNote:'สถานะอัปเดตหลังเซิร์ฟเวอร์ยืนยันการชำระเงิน หากเพิ่งชำระ กรุณารอสักครู่แล้วโหลดอีกครั้ง', unavailable:'ยังเปิดการชำระเงินไม่ได้ กรุณาลองใหม่ภายหลัง', offline:'ขณะนี้ออฟไลน์ เชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง', error:'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง', auth:'กรุณาเข้าสู่ระบบอีกครั้ง', changed:'บัญชีเปลี่ยนระหว่างดำเนินการ กรุณาลองใหม่', timeout:'ใช้เวลานานกว่าปกติ โปรดตรวจสอบสถานะก่อนลองทำรายการซ้ำ', discountError:'รหัสส่วนลดนี้ใช้ไม่ได้ ตรวจสอบรหัสและเงื่อนไขแล้วลองอีกครั้ง', permission:'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ', rate:'ทำรายการบ่อยเกินไป กรุณารอสักครู่', mailboxTaken:'ชื่อนี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น', invalid:'ข้อมูลไม่ถูกต้อง ตรวจสอบช่องกรอกแล้วลองอีกครั้ง', mailUnavailable:'บริการอีเมลยังไม่พร้อมใช้งาน', sentUncertain:'ยังยืนยันผลการส่งไม่ได้ กรุณาตรวจสอบโฟลเดอร์ส่งแล้วก่อนส่งซ้ำ', help:'ขอความช่วยเหลือ' },
  en: { loading:'Checking your membership…', retry:'Refresh', signIn:'Sign in with Google', signInText:'Use your Google account to subscribe and manage your mailbox', plan:'Taithai membership', price:'THB 99 / month', includes:'Taithai membership with @taithai.app email. More features will be added over time.', recurring:'Billed monthly with automatic renewal. Manage or cancel renewal through the billing portal.', account:'Signed in as', status:'Membership status', active:'Active', trialing:'Trial', past_due:'Payment due', canceled:'Canceled', incomplete:'Payment incomplete', unpaid:'Unpaid', paused:'Paused', none:'No membership yet', subscribe:'Subscribe', managing:'Opening…', manage:'Manage membership', inbox:'Go to mail', discount:'Discount code (optional)', discountHint:'Review the final total and terms at checkout before confirming payment', setup:'Subscriptions are not available yet', setupText:'The owner is setting up payments and email. Checkout becomes available when the service is ready.', test:'Test mode', testText:'Payments are in test mode. A test payment is not a live subscription.', renewal:'Current period ends', canceling:'Renewal is set to stop at the end of the current period', currentMail:'Your email', noMailbox:'Once your membership is active, choose your mailbox name on the mail page', unknown:'Not available yet', refreshNote:'Status updates after the server confirms payment. If you just paid, wait a moment and refresh.', unavailable:'Checkout is not available yet. Please try again later.', offline:'You are offline. Reconnect and try again.', error:'The action could not be completed. Please try again.', auth:'Please sign in again', changed:'Your account changed during this action. Please try again.', timeout:'This is taking longer than expected. Check the current status before retrying.', discountError:'This discount code cannot be used. Check the code and its terms.', permission:'This account does not have permission for this action', rate:'Too many requests. Wait a moment and try again.', mailboxTaken:'That mailbox name is already taken. Choose another.', invalid:'Check the entered information and try again', mailUnavailable:'Email service is not available yet', sentUncertain:'Sending could not be confirmed. Check Sent before sending again.', help:'Get help' }
};
const PAYMENT_STATUS = {th:{payment_pending:'รอยืนยันการชำระเงิน',payment_review:'รอตรวจสอบการชำระเงิน',ownerTrialTitle:'ทดลองอีเมลสำหรับเจ้าของ',ownerTrialText:'สิทธิ์ทดสอบรับและส่งอีเมลจริงเฉพาะเจ้าของ แยกจากสมาชิก 99 บาทต่อเดือน การทดลองนี้ไม่ใช่การสมัครสมาชิกรายเดือน'},en:{payment_pending:'Awaiting payment confirmation',payment_review:'Payment under review',ownerTrialTitle:'Owner email trial',ownerTrialText:'Owner-only access for testing real email receipt and sending, separate from the THB 99 monthly plan. This trial is not a monthly subscription.'}};
const QUANTITY_COPY = {
  th:{price:'99 บาท / เดือน',includes:'สมาชิก Taithai พร้อมอีเมล @taithai.app และฟีเจอร์ใหม่ที่จะทยอยเพิ่มในอนาคต',quantity:'จำนวนอีเมล',paidQuantity:'จำนวนอีเมลที่ยืนยันแล้ว',unitPrice:'สมาชิกเริ่มต้น 99 บาทต่อเดือน · เพิ่มอีเมล 99 บาทต่ออีเมลต่อเดือน',total:'ยอดรวมรายเดือน',increase:'ปรับสมาชิก',increaseTo:'จำนวนอีเมลรวมหลังปรับสมาชิก',reviewIncrease:'ตรวจสอบการเพิ่มจำนวนใน Stripe',resumeIncrease:'เปิดตรวจสอบจำนวนเดิมใน Stripe',proration:'หากเพิ่มระหว่างรอบ Stripe จะแสดงยอดส่วนต่างและเงื่อนไขก่อนยืนยัน จำนวนอีเมลใหม่เปิดใช้หลังเซิร์ฟเวอร์ยืนยันการชำระเงิน',increasePending:'มีรายการเพิ่มจำนวนอีเมลที่ยังไม่ยืนยัน สิทธิ์ปัจจุบันยังคงตามจำนวนที่ยืนยันแล้ว การกลับจาก Stripe ไม่ได้ยกเลิกรายการนี้ เปิดตรวจสอบจำนวนเดิมได้อีกครั้ง เมื่อเซิร์ฟเวอร์ยืนยันการชำระเงินแล้วจึงเพิ่มจำนวนต่อได้',increaseOnly:'เพิ่มอีเมลได้ตามต้องการ ขณะนี้ระบบรองรับการปรับจำนวนเพิ่มโดยเก็บอีเมลเดิมไว้',openingUncertain:'ยังยืนยันการเปิดหน้าชำระเงินไม่ได้ ลองรายการเดิมโดยไม่เปลี่ยนจำนวนหรือรหัสส่วนลด',retryOpening:'ลองเปิดรายการเดิมอีกครั้ง',clearOpening:'ล้างรายการที่รอยืนยัน',clearOpeningConfirm:'ตรวจสอบหน้าชำระเงินเดิมแล้วหรือยัง? การล้างรายการนี้ไม่ได้ยกเลิกการสมัครหรือหน้าชำระเงินที่ Stripe อาจสร้างแล้ว',checkoutOpen:'มีรายการชำระเงินเดิมที่ยังเปิดอยู่ กรุณาตรวจสอบรายการเดิมก่อนเปลี่ยนจำนวนหรือรหัสส่วนลด'},
  en:{price:'THB 99 / month',includes:'Taithai membership with @taithai.app email. More features will be added over time.',quantity:'Email quantity',paidQuantity:'Confirmed email quantity',unitPrice:'Membership starts at THB 99 per month · additional email THB 99 each per month',total:'Monthly total',increase:'Adjust membership',increaseTo:'Total email quantity after adjustment',reviewIncrease:'Review quantity increase in Stripe',resumeIncrease:'Reopen existing quantity review in Stripe',proration:'For an increase during a billing period, Stripe shows any prorated charge and terms before confirmation. New capacity opens after server-confirmed payment.',increasePending:'A quantity increase is awaiting confirmation. Current access remains limited to the confirmed quantity. Returning from Stripe does not cancel this review. Reopen the existing target; you can add further capacity after payment is confirmed.',increaseOnly:'Add email addresses as needed. Only increases are currently supported, preserving existing email.',openingUncertain:'Opening checkout could not be confirmed. Retry the original quantity and discount code.',retryOpening:'Retry original checkout',clearOpening:'Clear pending request',clearOpeningConfirm:'Have you checked the original checkout? Clearing this request does not cancel a subscription or checkout Stripe may already have created.',checkoutOpen:'An earlier checkout is still open. Check it before changing quantity or discount code.'}
};
const CAPACITY_COPY = {
  th:{capacityReached:'ผู้ให้บริการยังไม่มีพื้นที่สำหรับสร้างอีเมลเพิ่ม อีเมลเดิมยังใช้งานได้',notEntitled:'กล่องนี้ยังส่งอีเมลไม่ได้ ตรวจสอบสิทธิ์เจ้าของและสถานะบริการ',selectionRequired:'กรุณาเลือกกล่องอีเมลก่อนดำเนินการ',dailyQuota:'กล่องนี้ใช้โควตาส่งในรอบวันครบแล้ว กรุณารอโควตารอบถัดไป',increaseUnavailable:'ขณะนี้ยังปรับสมาชิกไม่ได้ กรุณาตรวจสอบสถานะหรือติดต่อผู้ดูแล',paymentLimit:'ระบบชำระเงินยังรับยอดหรือจำนวนนี้ไม่ได้ กรุณาปรับจำนวนหรือติดต่อผู้ดูแล'},
  en:{capacityReached:'The email provider has no space for another address. Existing email can still be used.',notEntitled:'Sending is unavailable for this mailbox. Check owner access and service status.',selectionRequired:'Choose a mailbox before continuing',dailyQuota:'This mailbox has reached its daily sending quota. Wait for the next quota period.',increaseUnavailable:'Membership adjustments are not available right now. Check the status or contact support.',paymentLimit:'The payment service cannot accept this amount or quantity. Adjust the quantity or contact support.'}
};
export function membershipText(language = 'th') { const key = language === 'en' ? 'en' : 'th';return {...MESSAGES[key],...PAYMENT_STATUS[key],...QUANTITY_COPY[key],...CAPACITY_COPY[key]}; }
export function mailboxQuantity(value) {const quantity = Number(value);if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(quantity * 9900)) throw Object.assign(Error('INVALID_QUANTITY'),{code:'INVALID_QUANTITY'});return quantity;}
export function mailboxMonthlyAmount(value) {return mailboxQuantity(value) * 9900;}
export function mailboxMonthlyPrice(value,language = 'th') {const amount = new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-GB').format(mailboxMonthlyAmount(value) / 100);return language === 'th' ? amount + ' บาท / เดือน' : 'THB ' + amount + ' / month';}
export function membershipError(error, language = 'th', online = true) {
  const text = membershipText(language), code = String(error?.code || error?.message || '').toLowerCase();
  if (!online) return text.offline;
  const aliasCopy=language==='en'?{limit:'The provider’s additional-name quota is full. Existing mail is still available.',name:'This additional name is unavailable. Choose another name.',confirmation:'Type the complete additional address to confirm deletion.',pending:'The result is not confirmed. Retry the original request with the same details.',state:'Additional names could not be loaded. Your inbox is still available.'}:{limit:'โควตาชื่อเพิ่มเติมของผู้ให้บริการเต็มแล้ว อีเมลเดิมยังใช้งานได้',name:'ชื่อเพิ่มเติมนี้ใช้ไม่ได้ กรุณาเลือกชื่ออื่น',confirmation:'พิมพ์ที่อยู่นามแฝงให้ครบเพื่อยืนยันการลบ',pending:'ยังยืนยันผลรายการไม่ได้ กรุณาตรวจสอบรายการเดิมโดยไม่เปลี่ยนข้อมูล',state:'ยังโหลดชื่อเพิ่มเติมไม่ได้ คุณยังเปิดอ่านอีเมลได้'};
  if(code==='mail_receiving_name_limit_reached')return language==='en'?'This list is full. Hiding a name does not stop incoming mail.':'รายการชื่อเต็มแล้ว การซ่อนชื่อไม่ปิดการรับอีเมล';
  if(code==='mail_catchall_required')return language==='en'?'Receiving unassigned names is not enabled yet. Existing aliases still work.':'ยังไม่เปิดรับทุกชื่ออัตโนมัติ นามแฝงเดิมยังใช้งานได้';
  if(code==='mail_receiving_name_is_provider_alias')return language==='en'?'Manage this name in the alias settings.':'จัดการชื่อนี้ในส่วนนามแฝงที่ตั้งไว้';
  if(code==='mail_receiving_names_unavailable')return language==='en'?'Receiving names could not be confirmed. Check the original request; your inbox is still available.':'ยังยืนยันรายการชื่อรับอีเมลไม่ได้ กรุณาตรวจสอบรายการเดิม อีเมลยังเปิดอ่านได้';
  if(code==='mail_alias_limit_reached')return aliasCopy.limit;
  if(['address_unavailable','reserved_local_part'].includes(code))return aliasCopy.name;
  if(code==='alias_confirmation_required')return aliasCopy.confirmation;
  if(/mail_alias_(?:provisioning|delete)_uncertain|request_id_conflict|operation_in_progress/.test(code))return aliasCopy.pending;
  if(code==='mail_alias_state_unavailable')return aliasCopy.state;
  if (/account.changed|session.changed/.test(code)) return text.changed;
  if (/timeout|abort/.test(code)) return text.timeout;
  if (/unauth|auth.required|auth.unavailable|token|sign.in/.test(code)) return text.auth;
  if (/permission|forbidden|owner.only|owner.required/.test(code)) return text.permission;
  if (/mailbox.capacity.reached/.test(code)) return text.capacityReached;
  if (/mailbox.not.entitled/.test(code)) return text.notEntitled;
  if (/mailbox.selection.required/.test(code)) return text.selectionRequired;
  if (/daily.limit/.test(code)) return text.dailyQuota;
  if (/provider.capacity/.test(code)) return text.mailUnavailable;
  if (/billing.amount.too.large|stripe.quantity.limit/.test(code)) return text.paymentLimit;
  if (/discount|promotion|coupon/.test(code)) return text.discountError;
  if (/quantity.update.pending/.test(code)) return text.increasePending;
  if (/checkout.already.open|subscription.pending/.test(code)) return text.checkoutOpen;
  if (/mailbox.*(taken|exists)|address.*exists/.test(code)) return text.mailboxTaken;
  if (/invalid|validation/.test(code)) return text.invalid;
  if (/rate|too.many|daily.limit/.test(code)) return text.rate;
  if (/not.configured|not.ready|setup|unavailable/.test(code)) return text.mailUnavailable;
  return text.error;
}
export function membershipLanguage(win, doc) { return win.TaithaiPreferences?.get?.().language === 'en' || !win.TaithaiPreferences && doc.documentElement.lang === 'en' ? 'en' : 'th'; }
export function memberDate(value, language = 'th') {
  if (!value) return membershipText(language).unknown;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) return membershipText(language).unknown;
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Bangkok' }).format(date);
}
export function createMembershipApi({ getUser, window: win = globalThis.window, request = win?.fetch?.bind(win) || globalThis.fetch } = {}) {
  const pending = new Set();
  async function call(action, { method = 'GET', data, params = {} } = {}) {
    const user = getUser?.();
    if (!user) throw Object.assign(Error('UNAUTHENTICATED'), { code:'UNAUTHENTICATED' });
    const uid = user.uid;
    const controller = new AbortController(); pending.add(controller);
    const timer = (win?.setTimeout || setTimeout)(() => controller.abort(), method === 'GET' ? 25000 : 55000);
    try {
      const token = await user.getIdToken();
      if (getUser?.()?.uid !== uid) throw Object.assign(Error('ACCOUNT_CHANGED'), { code:'ACCOUNT_CHANGED' });
      const query = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')) });
      const response = await request(`/api/membership/?${query}`, { method, cache:'no-store', credentials:'same-origin', signal:controller.signal, headers:{ Authorization:`Bearer ${token}`, ...(method !== 'GET' ? {'Content-Type':'application/json'} : {}) }, ...(method !== 'GET' ? {body:JSON.stringify(data || {})} : {}) });
      const result = await response.json().catch(() => ({}));
      if (getUser?.()?.uid !== uid) throw Object.assign(Error('ACCOUNT_CHANGED'), { code:'ACCOUNT_CHANGED' });
      if (!response.ok || result.ok === false) {
        const code = typeof result.error === 'object' ? result.error?.code : result.error || result.code;
        throw Object.assign(Error(code || `HTTP_${response.status}`), { code:code || (response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'PERMISSION_DENIED' : `HTTP_${response.status}`), status:response.status,deliveryUnknown:method==='POST'&&(action.startsWith('alias-')||action.startsWith('receiving-name-'))&&response.status>=500 });
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(Error('REQUEST_TIMEOUT'), { code:'REQUEST_TIMEOUT',deliveryUnknown:method==='POST'&&(action.startsWith('alias-')||action.startsWith('receiving-name-')) });
      if(method==='POST'&&(action.startsWith('alias-')||action.startsWith('receiving-name-'))&&!error.status&&!['ACCOUNT_CHANGED','UNAUTHENTICATED'].includes(error.code))error.deliveryUnknown=true;
      throw error;
    } finally { (win?.clearTimeout || clearTimeout)(timer); pending.delete(controller); }
  }
  return { call, aliases:input=>call('aliases',{params:input}),createAlias:input=>call('alias-create',{method:'POST',data:input}),deleteAlias:input=>call('alias-delete',{method:'POST',data:input}),saveReceivingName:input=>call('receiving-name-save',{method:'POST',data:input}),hideReceivingName:input=>call('receiving-name-hide',{method:'POST',data:input}),abort() { for (const controller of pending) controller.abort(); pending.clear(); } };
}
export function createMemberUi(doc) {
  const el = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
  const button = (text, action, {primary = false, disabled = false, danger = false} = {}) => { const node = el('button', text, `button ${primary ? 'button-primary' : danger ? 'button-danger' : 'button-secondary'}`); node.type = 'button'; node.disabled = disabled; node.addEventListener('click', action); return node; };
  const link = (text, href, primary = false) => { const node = el('a', text, `button ${primary ? 'button-primary' : 'button-secondary'}`); node.href = href; return node; };
  const panel = (title, text) => { const node = el('section', undefined, 'panel'); if (title) node.append(el('h2', title)); if (text) node.append(el('p', text, 'muted')); return node; };
  const field = (labelText, input, hint) => { const node = el('div', undefined, 'field'); const label = el('label', labelText); label.htmlFor = input.id; node.append(label, input); if (hint) { const note = el('p', hint, 'field-hint'); note.id = input.id + '-hint'; input.setAttribute('aria-describedby', note.id); node.append(note); } return node; };
  return { el, button, link, panel, field };
}
export function membershipReady(data) { return data?.ready === true; }
export function membershipActive(data) { return data?.membership?.active === true; }
export function membershipSetup(ui, text, testMode = false) {
  const panel = ui.panel(testMode ? text.test : text.setup, testMode ? text.testText : text.setupText); panel.classList.add('membership-notice'); panel.setAttribute('role','status'); return panel;
}
export function checkoutDestination(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.port && ['checkout.stripe.com','billing.stripe.com'].includes(url.hostname) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function initMembershipPage({ window: win = globalThis.window, document: doc = win?.document } = {}) {
  const root = doc?.getElementById('membershipPanel');
  if (!root || root.dataset.membershipInitialized) return null;
  root.dataset.membershipInitialized = 'true';
  const ui = createMemberUi(doc);
  function render() {
    const th = membershipLanguage(win,doc) === 'th';
    root.replaceChildren(ui.panel('',th ? 'ขณะนี้ยังไม่เปิดรับสมัครหรือชำระเงิน บริการอีเมลเปิดให้เจ้าของและผู้ดูแลที่ได้รับสิทธิ์' : 'Subscriptions and payments are paused. Mail is available to the owner and authorized administrators.'),ui.link(th ? 'ไปยังอีเมลผู้ดูแล' : 'Go to administrator mail','/mail/'),ui.link(th ? 'กลับไปหน้าแรก' : 'Back to apps','https://taithai.app/'));
  }
  render();win.addEventListener('taithai:preferences',render);
  return {refresh:render,destroy(){win.removeEventListener('taithai:preferences',render);delete root.dataset.membershipInitialized;}};
}
if (typeof window !== 'undefined' && document.body?.dataset.page === 'membership') initMembershipPage();
