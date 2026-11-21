/* Owner-only promotion controls. The server independently verifies ownership. */
import { createMembershipApi, createMemberUi, membershipText, membershipLanguage, membershipError, memberDate } from './site-membership.js';
import { isAppOwner } from './site-owner-session.js';
const COPY = {
  th:{ title:'สมาชิกและรหัสส่วนลด',intro:'สร้างส่วนลดสำหรับค่าสมาชิก 99 บาทต่อเดือน ตรวจสอบเงื่อนไขก่อนยืนยัน รหัสจะสร้างใน Stripe ตามโหมดที่ตั้งไว้',loading:'กำลังโหลดระบบสมาชิก…',denied:'เฉพาะเจ้าของเว็บไซต์เท่านั้น',refresh:'รีเฟรช',create:'สร้างชุดรหัสส่วนลด',percent:'ส่วนลด (%)',count:'จำนวนรหัสในชุด',limit:'จำนวนครั้งที่ใช้ได้ต่อรหัส',unlimited:'เว้นว่างเพื่อไม่จำกัดตามช่วงเวลาที่กำหนด',start:'เริ่มใช้ได้ (เวลาของอุปกรณ์นี้)',expiry:'หมดอายุ (เวลาของอุปกรณ์นี้)',duration:'ระยะเวลาที่ลดค่าสมาชิก',once:'ครั้งแรกครั้งเดียว',repeating:'ลดต่อเนื่องตามจำนวนเดือน',forever:'ลดทุกงวดตลอดอายุการสมัคร',months:'จำนวนเดือนที่ลด',confirm:'ยืนยันสร้างรหัสส่วนลดตามเงื่อนไขนี้ใช่ไหม',creating:'กำลังสร้าง…',created:'สร้างรหัสแล้ว',empty:'ยังไม่มีรหัสส่วนลด',codes:'รหัสที่สร้างแล้ว',code:'รหัส',terms:'เงื่อนไข',usage:'ใช้ไป / จำกัด',period:'ช่วงเวลา',state:'สถานะ',active:'เปิดใช้',disabled:'ปิดแล้ว',disable:'ปิดรหัส',disableConfirm:'ปิดรหัสนี้สำหรับการใช้ใหม่ใช่ไหม? ส่วนลดที่ใช้กับการสมัครไปแล้วอาจยังมีผลตามเงื่อนไขเดิม',disabledOk:'ปิดรหัสแล้ว',copy:'คัดลอกรหัส',copied:'คัดลอกรหัสแล้ว',copyFail:'คัดลอกไม่ได้ โปรดเลือกรหัสแล้วคัดลอกเอง',invalid:'ตรวจสอบเปอร์เซ็นต์ จำนวนรหัส ขีดจำกัด และช่วงเวลาให้ถูกต้อง',setup:'ระบบสมาชิกยังตั้งค่าไม่ครบ',setupText:'ยังสร้างรหัสส่วนลดไม่ได้จนกว่าระบบชำระเงินจะพร้อม',test:'กำลังดูข้อมูลโหมดทดสอบ รหัสเหล่านี้ใช้กับการชำระเงินจริงไม่ได้',noExpiry:'ไม่กำหนด',pending:'ยังยืนยันผลสร้างรหัสไม่ได้ กดตรวจสอบก่อนสร้างชุดใหม่เพื่อป้องกันรายการซ้ำ',check:'ตรวจสอบรายการอีกครั้ง',amount:'ราคาเต็ม',owner:'บัญชีเจ้าของ',config:'ความพร้อมระบบ',ready:'พร้อม',notReady:'ยังไม่พร้อม' },
  en:{ title:'Membership and discounts',intro:'Create discounts for the THB 99 monthly membership. Review the terms before confirming. Codes are created in the configured Stripe mode.',loading:'Loading membership administration…',denied:'Only the website owner can use this panel',refresh:'Refresh',create:'Create discount batch',percent:'Discount (%)',count:'Codes in this batch',limit:'Redemptions per code',unlimited:'Leave empty for no redemption limit during the valid period',start:'Starts (this device’s local time)',expiry:'Expires (this device’s local time)',duration:'How long the subscription discount lasts',once:'First payment only',repeating:'A fixed number of months',forever:'Every payment for the subscription lifetime',months:'Discount months',confirm:'Create discount codes with these terms?',creating:'Creating…',created:'Discount codes created',empty:'No discount codes yet',codes:'Created codes',code:'Code',terms:'Terms',usage:'Used / limit',period:'Valid period',state:'Status',active:'Active',disabled:'Disabled',disable:'Disable code',disableConfirm:'Disable this code for new redemptions? Discounts already applied to subscriptions may remain under their original terms.',disabledOk:'Code disabled',copy:'Copy code',copied:'Code copied',copyFail:'Copy failed. Select and copy the code manually.',invalid:'Check the percentage, batch size, redemption limit and date range',setup:'Membership setup is incomplete',setupText:'Discount codes cannot be created until payments are ready',test:'You are viewing test-mode data. These codes do not work for live payments.',noExpiry:'Not set',pending:'Creation could not be confirmed. Refresh the list before creating another batch to avoid duplicates.',check:'Check the list again',amount:'Full price',owner:'Owner account',config:'Service readiness',ready:'Ready',notReady:'Not ready' }
};
const DATE_COPY = {th:{start:'เริ่มใช้ได้ (เวลาไทย UTC+7)',expiry:'หมดอายุ (เวลาไทย UTC+7)'},en:{start:'Starts (Thailand time UTC+7)',expiry:'Expires (Thailand time UTC+7)'}};
const BATCH_COPY = {th:{more:'โหลดรหัสเพิ่มเติม',loadingMore:'กำลังโหลดรหัสเพิ่มเติม…',listFailed:'โหลดรายการรหัสไม่สำเร็จ รายการที่โหลดแล้วจะยังอยู่ ลองอีกครั้งหรือรีเฟรชเพื่อเริ่มโหลดใหม่',progress:'สร้างแล้ว {completed} จาก {total} รหัส กดสร้างชุดเดิมต่อเพื่อดำเนินการให้ครบ',working:'กำลังสร้างชุด',resume:'สร้างชุดเดิมต่อ'},en:{more:'Load more codes',loadingMore:'Loading more codes…',listFailed:'The code list could not load. Previously loaded codes are kept. Try again or refresh to restart the list.',progress:'Created {completed} of {total} codes. Resume this batch to finish.',working:'Batch in progress',resume:'Resume original batch'}};
const PLAN_COPY = {th:{intro:'สร้างส่วนลดสำหรับสมาชิก Taithai เริ่มต้น 99 บาทต่อเดือน อีเมลเพิ่มเติมคิด 99 บาทต่ออีเมลต่อเดือน ส่วนลดใช้กับยอดสมาชิกตามจริง ตรวจสอบเงื่อนไขก่อนยืนยัน'},en:{intro:'Create discounts for Taithai membership, starting at THB 99 per month. Additional email costs THB 99 each per month. Discounts apply to the billed membership total. Review the terms before confirming.'}};
export function discountDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw Error('INVALID_DISCOUNT_DATE');
  const [,year,month,day,hour,minute,second = '00',fraction = '',zone = '+07:00'] = match;
  const y = Number(year),m = Number(month),d = Number(day),leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0),days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw Error('INVALID_DISCOUNT_DATE');
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`);
  if (!Number.isFinite(date.getTime())) throw Error('INVALID_DISCOUNT_DATE');
  return date.toISOString();
}
export function validateDiscountDraft(value) {
  const integer = (input,min,max) => {const number = Number(input);if (!Number.isInteger(number) || number < min || number > max) throw Error('INVALID_DISCOUNT');return number;};
  const percentOff = integer(value.percentOff,1,100), count = integer(value.count,1,100), maxRedemptions = integer(value.maxRedemptions,1,10000);
  const duration = value.duration || 'once'; if (!['once','repeating','forever'].includes(duration)) throw Error('INVALID_DISCOUNT');
  const startsAt = discountDate(value.startsAt),expiresAt = discountDate(value.expiresAt);
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) throw Error('INVALID_DISCOUNT');
  return {percentOff,count,maxRedemptions,startsAt,expiresAt,duration,...(duration === 'repeating' ? {durationInMonths:integer(value.durationInMonths,1,36)} : {})};
}
export function initMembershipAdmin(container, { getUser, window: win = globalThis.window, document: doc = container?.ownerDocument || win?.document, request } = {}) {
  if (!container || container.dataset.membershipAdminInitialized) return null; container.dataset.membershipAdminInitialized = 'true';
  const ui = createMemberUi(doc), locale = () => membershipLanguage(win,doc), t = () => ({...COPY[locale()],...DATE_COPY[locale()],...PLAN_COPY[locale()],...BATCH_COPY[locale()]});
  const api = createMembershipApi({getUser,window:win,request});
  let state = null, loading = false, loadingMore = false, busy = '', status = null, disposed = false, suspended = false, sequence = 0, identity = getUser?.()?.uid || '', attempt = null, uncertain = false;
  const defaults = {percentOff:'10',count:'1',maxRedemptions:'1',startsAt:'',expiresAt:'',duration:'once',durationInMonths:'3'};
  let draft = {...defaults},baseline = JSON.stringify(defaults);
  const allowed = () => isAppOwner(getUser?.());
  const pendingKey = () => `taithai.discounts.pending.v1:${identity}`;
  function storeAttempt() {try {if (attempt) win.sessionStorage.setItem(pendingKey(),JSON.stringify(attempt));else win.sessionStorage.removeItem(pendingKey());}catch {/* The leave guard protects the in-memory original request when storage is blocked. */}}
  function restoreAttempt() {
    attempt = null;uncertain = false;
    if (!allowed()) return;
    try {
      const value = JSON.parse(win.sessionStorage.getItem(pendingKey()) || 'null');
      if (value && /^[A-Za-z0-9_-]{16,100}$/.test(value.requestId || '') && value.payload) {
        const payload = validateDiscountDraft(value.payload);attempt = {...value,payload,serialized:JSON.stringify(payload)};delete attempt.progress;
        if (value.progress && Number.isInteger(value.progress.completed) && value.progress.completed >= 0 && value.progress.total === payload.count && value.progress.completed < payload.count) attempt.progress = {completed:value.progress.completed,total:payload.count};
        draft = {...defaults,...(value.draft || {}),percentOff:String(payload.percentOff),count:String(payload.count),maxRedemptions:String(payload.maxRedemptions),duration:payload.duration,durationInMonths:String(payload.durationInMonths || defaults.durationInMonths)};uncertain = true;
      }
    } catch {/* Ignore a damaged optional recovery record; no request is sent automatically. */}
  }
  const dirty = () => Boolean(busy || uncertain || JSON.stringify(draft) !== baseline);
  const leaveMessage = () => locale() === 'th' ? 'มีเงื่อนไขส่วนลดที่แก้ไขหรือรายการที่ยังยืนยันผลไม่ได้ การออกจากหน้านี้อาจทำให้ต้องตรวจสอบชุดรหัสอีกครั้ง' : 'Discount changes or an unconfirmed creation are pending. Leaving may require checking the original batch again.';
  function flash(message,error = false) {status = {message,error};}
  function inputField(name,label,type = 'number',hint) {
    const input = ui.el('input'); input.id = `discount-${name}`; input.name = name; input.type = type; input.value = draft[name]; input.disabled = Boolean(busy) || uncertain; if (type === 'number') {input.step = '1';input.min = '1';input.required = true;input.max = name === 'percentOff' || name === 'count' ? '100' : name === 'durationInMonths' ? '36' : '10000';}
    input.addEventListener('input',() => {draft[name] = input.value;}); return ui.field(label,input,hint);
  }
  function render() {
    if (disposed || suspended) return; const text = t(); container.replaceChildren(); container.setAttribute('aria-busy',String(loading || Boolean(busy)));
    if (!allowed()) {container.append(ui.panel('',text.denied));return;}
    const introduction = ui.panel(text.title,text.intro); introduction.append(ui.el('p',`${text.owner} · ${getUser()?.email || ''}`,'small')); container.append(introduction);
    if (status) {const notice = ui.el('p',status.message,status.error ? 'notice notice-error' : 'notice');notice.setAttribute('role',status.error ? 'alert' : 'status');container.append(notice);}
    if (loading && !state) {container.append(ui.panel('',text.loading));return;}
    if (!state) {container.append(ui.button(text.refresh,refresh,{disabled:loading}));return;}
    if (state.testMode) container.append(ui.panel(membershipText(locale()).test,text.test));
    if (state.ready !== true) container.append(ui.panel(text.setup,text.setupText));
    if (state.configuration && typeof state.configuration === 'object') {
      const panel = ui.panel(text.config),th = locale() === 'th';
      const names = th ? {database:'ฐานข้อมูลสมาชิก',payments:'ระบบชำระเงิน',mail:'ระบบอีเมล',sales:'เปิดรับสมัครแบบชำระเงิน',ownerTrial:'สิทธิ์ทดลองเมลเฉพาะเจ้าของ'} : {database:'Membership database',payments:'Payments',mail:'Email service',sales:'Paid subscriptions enabled',ownerTrial:'Owner-only email trial'};
      const list = ui.el('dl',undefined,'membership-details');
      for (const [key,value] of Object.entries(state.configuration)) if (typeof value === 'boolean') {
        const label = ['sales','ownerTrial'].includes(key) ? (value ? (th ? 'เปิด' : 'Enabled') : (th ? 'ปิด' : 'Disabled')) : value ? text.ready : text.notReady;
        list.append(ui.el('dt',names[key] || key),ui.el('dd',label));
      }
      panel.append(list);container.append(panel);
    }
    const create = ui.panel(text.create), form = ui.el('form'), grid = ui.el('div',undefined,'membership-admin-fields');
    grid.append(inputField('percentOff',text.percent),inputField('count',text.count),inputField('maxRedemptions',text.limit),inputField('startsAt',text.start,'datetime-local'),inputField('expiresAt',text.expiry,'datetime-local'));
    const duration = ui.el('select');duration.id = 'discount-duration';duration.disabled = Boolean(busy) || uncertain;
    for (const [value,label] of [['once',text.once],['repeating',text.repeating],['forever',text.forever]]) {const option = ui.el('option',label);option.value = value;option.selected = draft.duration === value;duration.append(option);} duration.value = draft.duration;duration.addEventListener('change',() => {draft.duration = duration.value;render();});grid.append(ui.field(text.duration,duration));
    if (draft.duration === 'repeating') grid.append(inputField('durationInMonths',text.months));
    form.append(grid);const actions = ui.el('div',undefined,'button-row'), submit = ui.el('button',busy === 'create' ? text.creating : text.create,'button button-primary');submit.type = 'submit';submit.disabled = Boolean(busy) || loading || state.ready !== true || uncertain;actions.append(submit,ui.button(text.refresh,refresh,{disabled:loading || Boolean(busy)}));form.append(actions);form.addEventListener('submit',event => {event.preventDefault();void createCodes();});create.append(form);
    if (uncertain) {
      const progress = attempt?.progress, message = progress ? text.progress.replace('{completed}',progress.completed).replace('{total}',progress.total) : text.pending;
      create.append(ui.el('p',message,'notice'),ui.button(progress ? text.resume : locale() === 'th' ? 'ตรวจสอบและสร้างชุดเดิมต่อ' : 'Check and resume original batch',() => createCodes(true),{primary:true,disabled:loading || Boolean(busy) || state.ready !== true}),ui.button(text.check,refresh,{disabled:loading || Boolean(busy)}));
      create.append(ui.button(locale() === 'th' ? 'ล้างรายการที่รอยืนยัน' : 'Clear pending request',clearAttempt,{disabled:loading || Boolean(busy)}));
    }container.append(create);
    const codes = ui.panel(text.codes), values = Array.isArray(state.discounts) ? state.discounts : [];
    if (!values.length) codes.append(ui.el('p',text.empty,'muted'));
    else {
      const wrap = ui.el('div',undefined,'data-table-wrap');wrap.tabIndex = 0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',text.codes);const table = ui.el('table',undefined,'data-table');const head = ui.el('thead'), headings = ui.el('tr');for (const label of [text.code,text.terms,text.usage,text.period,text.state]) headings.append(ui.el('th',label));head.append(headings);table.append(head);const body = ui.el('tbody');
      for (const discount of values) {
        const row = ui.el('tr'), code = ui.el('td'), codeText = ui.el('code',discount.code || '');code.append(codeText,ui.button(text.copy,() => copyCode(discount.code),{disabled:!discount.code || discount.batchComplete === false || Boolean(busy)}));
        const terms = ui.el('td',`${discount.percentOff ?? ''}% · ${discount.duration === 'forever' ? text.forever : discount.duration === 'repeating' || discount.durationInMonths ? `${discount.durationInMonths || discount.durationMonths || ''} ${text.months}` : text.once}`);
        const scheduled = discount.activationPending === true || discount.startsAt && Date.parse(discount.startsAt) > Date.now();
        const stateLabels = locale() === 'th' ? {scheduled:'รอเวลาเริ่ม',expired:'หมดอายุ',exhausted:'ใช้ครบจำนวนแล้ว',disabled:text.disabled,ready:text.active} : {scheduled:'Scheduled',expired:'Expired',exhausted:'Redemption limit reached',disabled:text.disabled,ready:text.active};
        const stateLabel = discount.batchComplete === false ? text.working : discount.enabled === false ? text.disabled : stateLabels[discount.status] || (scheduled ? stateLabels.scheduled : discount.active === false ? (locale() === 'th' ? 'ยังไม่เปิดใช้' : 'Inactive') : text.active);
        const usage = ui.el('td',`${discount.timesRedeemed || 0} / ${discount.maxRedemptions ?? '∞'}`), period = ui.el('td',`${discount.startsAt ? memberDate(discount.startsAt,locale()) : text.noExpiry}\n→ ${discount.expiresAt ? memberDate(discount.expiresAt,locale()) : text.noExpiry}`), active = ui.el('td',stateLabel);
        if (discount.enabled !== false) active.append(ui.button(text.disable,() => disableCode(discount.id),{disabled:loading || Boolean(busy),danger:true}));row.append(code,terms,usage,period,active);body.append(row);
      }
      table.append(body);wrap.append(table);codes.append(wrap);
    }
    if (state.nextCursor) codes.append(ui.button(loadingMore ? text.loadingMore : text.more,loadMore,{disabled:loading || Boolean(busy)}));
    container.append(codes);
    const risks = Array.isArray(state.riskEvents) ? state.riskEvents : [];
    if (risks.length) {
      const th = locale() === 'th',review = ui.panel(th ? 'รายการชำระเงินที่ควรตรวจสอบ' : 'Payments to review',th ? 'ตรวจสอบรายการคืนเงิน ข้อพิพาท และการแจ้งเตือนความเสี่ยง แล้วดำเนินการต่อใน Stripe Dashboard' : 'Review refunds, disputes and risk alerts, then continue in the Stripe Dashboard.');
      const wrap = ui.el('div',undefined,'data-table-wrap');wrap.tabIndex = 0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',th ? 'รายการตรวจสอบการชำระเงิน' : 'Payment review records');
      const table = ui.el('table',undefined,'data-table'),head = ui.el('thead'),labels = ui.el('tr');
      for (const label of (th ? ['ประเภท / สถานะ','บัญชี','ธงตรวจสอบ','อัปเดต','อ้างอิง'] : ['Type / status','Account','Review flag','Updated','Reference'])) labels.append(ui.el('th',label));head.append(labels);table.append(head);const rows = ui.el('tbody');
      for (const risk of risks) {
        const types = th ? {refund:'คืนเงิน',dispute:'ข้อพิพาท',fraud_warning:'แจ้งเตือนความเสี่ยง'} : {refund:'Refund',dispute:'Dispute',fraud_warning:'Risk warning'};
        const row = ui.el('tr'),type = ui.el('td',types[risk.type] || risk.type || '—');type.append(ui.el('p',risk.status || '', 'small'));
        row.append(type,ui.el('td',risk.uid || (th ? 'รอตรวจสอบบัญชีที่เกี่ยวข้อง' : 'Account needs review')),ui.el('td',risk.blocked === true ? (th ? 'ต้องตรวจสอบ' : 'Needs review') : (th ? 'ติดตามสถานะ' : 'Monitor status')),ui.el('td',memberDate(risk.updatedAt || risk.createdAt,locale())),ui.el('td',risk.chargeId || risk.invoiceId || risk.id || '—'));rows.append(row);
      }
      table.append(rows);wrap.append(table);review.append(wrap);const dashboard = ui.link(th ? 'เปิด Stripe Dashboard' : 'Open Stripe Dashboard','https://dashboard.stripe.com/');dashboard.target = '_blank';dashboard.rel = 'noopener noreferrer';review.append(dashboard);container.append(review);
    }
  }
  function normalizePage(result,previousCursor) {
    if (!result || !Array.isArray(result.discounts) || result.discounts.some(item => !item || typeof item.id !== 'string' || !item.id)) throw Error('INVALID_DISCOUNT_PAGE');
    const nextCursor = result.nextCursor === undefined || result.nextCursor === null ? null : result.nextCursor;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor || nextCursor.length > 8192 || nextCursor === previousCursor) || result.hasMore === true && !nextCursor || result.hasMore === false && nextCursor) throw Error('INVALID_DISCOUNT_PAGE');
    return {...result,discounts:[...new Map(result.discounts.map(item => [item.id,item])).values()],nextCursor};
  }
  function mergeDiscounts(previous,additional) {const merged = new Map(previous.map(item => [item.id,item]));for (const item of additional) merged.set(item.id,item);return [...merged.values()];}
  async function loadMore() {
    if (disposed || suspended || loading || busy || !allowed() || !state?.nextCursor) return;
    const cursor = state.nextCursor,uid = getUser()?.uid,current = ++sequence;loading = true;loadingMore = true;status = null;render();
    try {
      const page = normalizePage(await api.call('admin-discounts',{params:{cursor}}),cursor);
      if (disposed || suspended || current !== sequence || uid !== getUser()?.uid || !allowed()) return;
      state = {...state,...page,configuration:state.configuration,discounts:mergeDiscounts(state.discounts || [],page.discounts)};
    } catch (error) {if (!disposed && current === sequence && uid === getUser()?.uid) flash(t().listFailed,true);}
    finally {if (!disposed && current === sequence) {loading = false;loadingMore = false;render();}}
  }
  async function refresh() {
    if (suspended && allowed()) suspended = false;
    const uid = getUser()?.uid || ''; if (uid !== identity) {sequence++;api.abort();identity = uid;state = null;attempt = null;uncertain = false;loading = false;loadingMore = false;busy = '';draft = {...defaults};baseline = JSON.stringify(defaults);restoreAttempt();}
    if (disposed || loading || busy || !allowed()) {if (!disposed) render();return;}
    const current = ++sequence;loading = true;render();
    try {const [result,health] = await Promise.all([api.call('admin-discounts'),api.call('admin-status')]);if (disposed || current !== sequence || uid !== getUser()?.uid || !allowed()) return;state = {...normalizePage(result),configuration:health.checks || {}};}
    catch (error) {if (!disposed && current === sequence && uid === getUser()?.uid) flash(membershipError(error,locale(),win.navigator?.onLine !== false),true);}
    finally {if (!disposed && current === sequence) {loading = false;render();}}
  }
  async function createCodes(resume = false) {
    if (!allowed() || loading || busy || uncertain && !resume || state?.ready !== true || suspended) return;
    let value;try {value = resume && attempt ? attempt.payload : validateDiscountDraft(draft);}catch {flash(t().invalid,true);render();return;}
    if (!(resume && attempt) && !win.confirm(`${t().confirm}\n${value.count} × ${value.percentOff}%`)) return;
    const serialized = JSON.stringify(value); if (!attempt || attempt.serialized !== serialized) attempt = {serialized,payload:value,draft:{...draft},requestId:win.crypto.randomUUID()};storeAttempt();
    const uid = getUser()?.uid,current = ++sequence;busy = 'create';status = null;render();
    try {
      const result = await api.call('admin-discount-create',{method:'POST',data:{...value,requestId:attempt.requestId}});
      if (disposed || current !== sequence || uid !== getUser()?.uid || !allowed()) return;
      if (!result || !Array.isArray(result.discounts) || result.discounts.some(item => !item || typeof item.id !== 'string' || !item.id)) throw Object.assign(Error('INVALID_BATCH_RECEIPT'),{code:'INVALID_BATCH_RECEIPT',status:503});
      if (result.complete === false) {
        if (result.state !== 'creating' || result.total !== value.count || !Number.isInteger(result.completed) || result.completed < 0 || result.completed >= result.total) throw Object.assign(Error('INVALID_BATCH_RECEIPT'),{code:'INVALID_BATCH_RECEIPT',status:503});
        attempt = {...attempt,progress:{completed:result.completed,total:result.total}};uncertain = true;storeAttempt();
        if (Array.isArray(result.discounts)) state = {...state,discounts:mergeDiscounts(state.discounts || [],result.discounts.map(item => ({...item,batchComplete:false,active:false,status:'creating'})))};
        flash(t().progress.replace('{completed}',result.completed).replace('{total}',result.total));
      } else {
        if (result.complete !== true || result.state !== 'complete' || result.completed !== value.count || result.total !== value.count) throw Object.assign(Error('INVALID_BATCH_RECEIPT'),{code:'INVALID_BATCH_RECEIPT',status:503});
        attempt = null;uncertain = false;baseline = JSON.stringify(draft);storeAttempt();flash(t().created);
        if (Array.isArray(result.discounts)) {
          const merged = new Map((state.discounts || []).map(item=>[item.id,item]));
          for(const discount of result.discounts) merged.set(discount.id,discount);
          state = {...state,discounts:[...merged.values()]};
        }
      }
    }
    catch (error) {if (!disposed && current === sequence && uid === getUser()?.uid) {uncertain = resume || uncertain || !error.status || error.status >= 500 || /timeout|network|fetch|abort/i.test(error?.code || error?.message || '');if (!uncertain) {attempt = null;storeAttempt();}flash(uncertain ? t().pending : membershipError(error,locale(),win.navigator?.onLine !== false),true);}}
    finally {if (!disposed && current === sequence) {busy = '';render();if (!uncertain) void refresh();}}
  }
  function clearAttempt() {
    const message = locale() === 'th' ? 'ตรวจสอบรายการรหัสแล้วหรือยัง? การล้างรายการนี้ไม่ยกเลิกรหัสที่อาจสร้างแล้ว การสร้างชุดใหม่อาจทำให้ซ้ำ' : 'Have you checked the code list? Clearing this request does not cancel codes that may already exist. A new batch could create duplicates.';
    if (loading || busy || !win.confirm(message)) return;attempt = null;uncertain = false;storeAttempt();render();
  }
  async function disableCode(id) {
    if (!id || !allowed() || loading || busy || !win.confirm(t().disableConfirm)) return;
    const uid = getUser()?.uid,current = ++sequence;busy = 'disable';status = null;render();
    try {await api.call('admin-discount-disable',{method:'POST',data:{id}});if (disposed || current !== sequence || uid !== getUser()?.uid || !allowed()) return;state = {...state,discounts:(state.discounts || []).map(item => item.id === id ? {...item,active:false,enabled:false} : item)};flash(t().disabledOk);}
    catch (error) {if (!disposed && current === sequence && uid === getUser()?.uid) flash(membershipError(error,locale(),win.navigator?.onLine !== false),true);}
    finally {if (!disposed && current === sequence) {busy = '';render();}}
  }
  async function copyCode(value) {try {await win.navigator.clipboard.writeText(String(value));flash(t().copied);}catch {flash(t().copyFail,true);}render();}
  function beforeUnload(event) {if (dirty()) {event.preventDefault();event.returnValue = '';}}
  function suspend() {suspended = true;sequence++;api.abort();state = null;loading = false;loadingMore = false;busy = '';container.replaceChildren();if (attempt) uncertain = true;}
  const preferences = () => render();win.addEventListener('taithai:preferences',preferences);win.addEventListener('beforeunload',beforeUnload);win.addEventListener('pagehide',suspend);restoreAttempt();render();void refresh();
  return {refresh,dirty,isSaving:() => Boolean(busy),leaveMessage,destroy(){disposed = true;sequence++;api.abort();win.removeEventListener('taithai:preferences',preferences);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('pagehide',suspend);container.replaceChildren();delete container.dataset.membershipAdminInitialized;}};
}
