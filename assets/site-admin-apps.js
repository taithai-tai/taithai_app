// App visibility follows Taithai's personal workbench direction.
// Design pass informed by unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
import { APP_CATALOG } from './site-app-catalog.js';
const MODES = ['public', 'unlisted', 'private'];
const COPY = {
  en: {
    title: 'App visibility', intro: 'Choose who can discover and open each app. Changes take effect only after you save.',
    public: 'Public', unlisted: 'Unlisted', private: 'Owner testing',
    publicHint: 'Shown in the collection. Anyone can open it.', unlistedHint: 'Hidden from the collection. Anyone with a direct link can still open it.', privateHint: 'Hidden from visitors. Only the signed-in website owner can open it for testing.',
    visibility: 'Visibility', savedState: 'Saved', changed: 'Unsaved', open: 'Open app', locked: 'Owner only', lockedHint: 'Private Drive remains restricted to the owner.',
    loading: 'Loading app settings…', loadFailed: 'App settings could not be loaded. No visibility was changed.', invalid: 'The saved app settings could not be verified. Reload them before editing.',
    save: 'Save visibility', saving: 'Saving visibility…', cancel: 'Discard changes', refresh: 'Reload saved settings', retry: 'Try again',
    pending: 'Unsaved changes', unchanged: 'All changes saved', saved: 'App visibility saved', failed: 'Could not save. Your changes are still here.',
    conflict: 'These settings changed in another window. Reload the saved settings before making another change.',
    uncertain: 'The server has not confirmed this save. Check the saved settings before trying again.', verify: 'Check saved settings', verifying: 'Checking saved settings…',
    reloadConfirm: 'Reload saved app settings and discard your unsaved visibility changes?', leaveConfirm: 'Leave this page and discard your unsaved changes?',
    savedAt: 'Last saved', initial: 'Using the original app settings. Nothing has been changed yet.',
    cacheHint: 'Changing access does not remove copies that a visitor has already downloaded or saved offline.',
    nextVisit: 'The saved settings apply to new page requests. An app already open may need to be refreshed.',
  },
  th: {
    title: 'การมองเห็นแอป', intro: 'เลือกได้ว่าใครค้นพบและเปิดแต่ละแอปได้ การเปลี่ยนแปลงมีผลเมื่อกดบันทึก',
    public: 'เผยแพร่', unlisted: 'ซ่อนจากรายการ', private: 'ทดสอบเฉพาะเจ้าของ',
    publicHint: 'แสดงในหน้ารวมแอป ทุกคนเปิดใช้งานได้', unlistedHint: 'ไม่แสดงในหน้ารวมแอป คนที่มีลิงก์ตรงยังเปิดได้', privateHint: 'ไม่แสดงให้ผู้เยี่ยมชมเห็น เฉพาะเจ้าของเว็บไซต์ที่เข้าสู่ระบบเปิดทดสอบได้',
    visibility: 'การมองเห็น', savedState: 'บันทึกไว้', changed: 'ยังไม่บันทึก', open: 'เปิดแอป', locked: 'เฉพาะเจ้าของ', lockedHint: 'Private Drive ยังคงจำกัดเฉพาะบัญชีเจ้าของ',
    loading: 'กำลังโหลดการตั้งค่าแอป…', loadFailed: 'โหลดการตั้งค่าแอปไม่สำเร็จ ยังไม่มีการเปลี่ยนการมองเห็น', invalid: 'ตรวจสอบการตั้งค่าที่บันทึกไว้ไม่สำเร็จ กรุณาโหลดใหม่ก่อนแก้ไข',
    save: 'บันทึกการมองเห็น', saving: 'กำลังบันทึกการมองเห็น…', cancel: 'ยกเลิกการแก้ไข', refresh: 'โหลดค่าที่บันทึกไว้', retry: 'ลองอีกครั้ง',
    pending: 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก', unchanged: 'บันทึกการเปลี่ยนแปลงครบแล้ว', saved: 'บันทึกการมองเห็นแอปแล้ว', failed: 'บันทึกไม่สำเร็จ การแก้ไขของคุณยังอยู่',
    conflict: 'มีการเปลี่ยนการตั้งค่าจากหน้าต่างอื่น กรุณาโหลดค่าที่บันทึกไว้ก่อนแก้ไขต่อ',
    uncertain: 'เซิร์ฟเวอร์ยังไม่ยืนยันผลการบันทึก ตรวจสอบค่าที่บันทึกไว้ก่อนลองอีกครั้ง', verify: 'ตรวจสอบค่าที่บันทึกไว้', verifying: 'กำลังตรวจสอบค่าที่บันทึกไว้…',
    reloadConfirm: 'โหลดค่าที่บันทึกไว้และยกเลิกการแก้ไขการมองเห็นที่ยังไม่บันทึกหรือไม่', leaveConfirm: 'ออกจากหน้านี้และยกเลิกการแก้ไขที่ยังไม่บันทึกหรือไม่',
    savedAt: 'บันทึกล่าสุด', initial: 'ใช้การมองเห็นเดิมของแต่ละแอป ยังไม่มีการเปลี่ยนการตั้งค่า',
    cacheHint: 'การเปลี่ยนสิทธิ์ไม่ลบสำเนาที่ผู้เยี่ยมชมเคยดาวน์โหลดหรือบันทึกออฟไลน์ไว้แล้ว',
    nextVisit: 'ค่าที่บันทึกใช้กับการเปิดหน้าใหม่ หากเปิดแอปค้างไว้อาจต้องรีเฟรช',
  },
};
function copyApps(settings) {
  if (!settings || settings.valid === false || !Number.isInteger(settings.revision) || settings.revision < 0) throw new Error('INVALID_APP_SETTINGS');
  const apps = {};
  for (const app of APP_CATALOG) {
    const visibility = settings.apps?.[app.id]?.visibility;
    if (!MODES.includes(visibility) || app.locked && visibility !== app.defaultVisibility) throw new Error('INVALID_APP_SETTINGS');
    apps[app.id] = { visibility };
  }
  return apps;
}
function sameApps(left, right) { return Boolean(left && right && APP_CATALOG.every(app => left[app.id]?.visibility === right[app.id]?.visibility)); }

export function createAppVisibilityPanel({ document: doc, window: win, locale, isOwner, loadData, redraw }) {
  let snapshot = null; let draft = null; let loading = false; let saving = false; let request = 0; let epoch = 0;
  let error = ''; let message = ''; let conflict = false; let uncertain = false; let verifying = false; let disposed = false;
  const t = () => COPY[locale() === 'th' ? 'th' : 'en'];
  const allowed = (token = epoch) => !disposed && token === epoch && isOwner();
  const dirty = () => Boolean(snapshot && draft && !sameApps(snapshot.apps, draft));
  function el(tag, text, className) { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, handler, primary = false) { const node = el('button', text, 'button ' + (primary ? 'button-primary' : 'button-secondary')); node.type = 'button'; node.addEventListener('click', handler); return node; }
  function notice(text, bad = false) { const node = el('p', text, bad ? 'notice notice-error' : 'notice'); node.setAttribute('role', bad ? 'alert' : 'status'); return node; }
  function install(value) { const apps = copyApps(value); snapshot = { ...value, apps }; draft = copyApps(snapshot); }
  function confirmReload() { return !dirty() || typeof win.confirm !== 'function' || win.confirm(t().reloadConfirm); }
  async function load({ force = false, verify = false } = {}) {
    if (!allowed() || loading || saving || !force && snapshot) return;
    if (!verify && !confirmReload()) return;
    const token = epoch; const attempt = ++request; loading = true; verifying = verify; error = ''; message = ''; redraw();
    try {
      const source = await loadData(); if (!allowed(token) || attempt !== request) return;
      const latest = await source.getAppVisibilitySettings(); if (!allowed(token) || attempt !== request) return;
      const latestApps = copyApps(latest);
      if (verify && !sameApps(latestApps, draft)) { conflict = true; uncertain = false; error = 'conflict'; }
      else { install(latest); conflict = uncertain = false; message = verify ? 'saved' : ''; }
    } catch (failure) { if (allowed(token) && attempt === request) error = failure?.message === 'INVALID_APP_SETTINGS' ? 'invalid' : 'loadFailed'; }
    finally { if (allowed(token) && attempt === request) { loading = verifying = false; redraw(); } }
  }
  async function save(event) {
    event?.preventDefault(); if (!allowed() || loading || saving || conflict || uncertain || !dirty()) return;
    const token = epoch; const attempt = ++request; const expectedRevision = snapshot.revision;
    const apps = copyApps({ revision: expectedRevision, apps: draft }); saving = true; error = message = ''; redraw();
    try {
      const source = await loadData(); if (!allowed(token) || attempt !== request) return;
      const result = await source.updateAppVisibilitySettings({ apps, expectedRevision }); if (!allowed(token) || attempt !== request) return;
      const savedApps = copyApps(result);
      if (result.revision !== expectedRevision + 1 || !sameApps(savedApps, apps)) throw new Error('INVALID_SAVE_RESULT');
      install(result); conflict = uncertain = false; message = 'saved';
    } catch (failure) {
      if (allowed(token) && attempt === request) {
        conflict = failure?.code === 'site/conflict';
        uncertain = failure?.deliveryUnknown === true || failure?.code === 'site/timeout-uncertain' || failure?.message === 'INVALID_SAVE_RESULT';
        error = conflict ? 'conflict' : uncertain ? 'uncertain' : 'failed';
      }
    } finally { if (allowed(token) && attempt === request) { saving = false; redraw(); } }
  }
  function cancel() { if (!allowed() || loading || saving || uncertain) return; draft = copyApps(snapshot); message = ''; error = conflict ? 'conflict' : ''; redraw(); }
  function render(container) {
    if (!allowed()) return;
    const intro = el('section', undefined, 'panel admin-app-intro'); intro.append(el('h2', t().title), el('p', t().intro, 'muted'));
    const legend = el('dl', undefined, 'admin-app-legend');
    for (const mode of MODES) { const item = el('div'); item.append(el('dt', t()[mode]), el('dd', t()[mode + 'Hint'])); legend.append(item); }
    intro.append(legend); container.append(intro);
    if (loading) container.append(notice(verifying ? t().verifying : t().loading));
    if (error) container.append(notice(t()[error], true));
    if (!snapshot) { if (!loading) container.append(button(t().retry, () => load({ force: true }))); return; }
    const form = el('form'); form.id = 'adminAppsForm'; form.setAttribute('aria-busy', String(loading || saving)); form.addEventListener('submit', save);
    const list = el('div', undefined, 'admin-app-list');
    for (const app of APP_CATALOG) {
      const name = app.name?.[locale()] || app.name?.en || app.id; const mode = draft[app.id].visibility;
      const row = el('section', undefined, 'admin-app-row'); const description = el('div', undefined, 'admin-app-name'); description.append(el('h3', name));
      const address = el('a', t().open, 'admin-app-link'); address.href = app.href; address.target = '_blank'; address.rel = 'noopener'; address.setAttribute('aria-label', `${t().open}: ${name}`); description.append(address);
      const control = el('div', undefined, 'field admin-app-control'); const label = el('label', `${t().visibility}: ${name}`, 'sr-only'); const input = el('select'); input.id = `adminAppVisibility-${app.id}`; label.htmlFor = input.id;
      for (const value of MODES) { const option = el('option', t()[value]); option.value = value; option.selected = value === mode; input.append(option); }
      input.value = mode; input.disabled = app.locked || loading || saving || conflict || uncertain;
      const hint = el('p', app.locked ? t().lockedHint : t()[mode + 'Hint'], 'field-hint'); hint.id = `adminAppHint-${app.id}`; input.setAttribute('aria-describedby', hint.id);
      input.addEventListener('change', () => {
        if (!allowed() || app.locked || loading || saving || conflict || uncertain || !MODES.includes(input.value)) return;
        draft[app.id] = { visibility: input.value }; message = ''; error = ''; redraw(); doc.getElementById(input.id)?.focus();
      });
      control.append(label, input, hint); const state = el('div', undefined, 'admin-app-state'); const changed = snapshot.apps[app.id].visibility !== mode;
      state.append(el('span', app.locked ? t().locked : changed ? t().changed : t().savedState, changed ? 'admin-app-changed' : 'muted'));
      if (changed) state.append(el('span', t()[snapshot.apps[app.id].visibility], 'admin-secondary'));
      row.append(description, control, state); list.append(row);
    }
    form.append(list);
    const footer = el('div', undefined, 'admin-app-savebar'); const status = el('p', t()[message] || (dirty() ? t().pending : t().unchanged)); status.id = 'adminAppsMessage'; status.setAttribute('role', 'status'); footer.append(status);
    const actions = el('div', undefined, 'admin-app-actions'); const saveButton = button(saving ? t().saving : t().save, () => {}, true); saveButton.id = 'adminAppsSave'; saveButton.type = 'submit'; saveButton.disabled = !dirty() || loading || saving || conflict || uncertain;
    const cancelButton = button(t().cancel, cancel); cancelButton.id = 'adminAppsCancel'; cancelButton.disabled = !dirty() || loading || saving || uncertain;
    const refresh = button(t().refresh, () => load({ force: true })); refresh.id = 'adminAppsReload'; refresh.disabled = loading || saving;
    actions.append(saveButton, cancelButton, refresh);
    if (uncertain) { const verify = button(t().verify, () => load({ force: true, verify: true })); verify.id = 'adminAppsVerify'; verify.disabled = loading || saving; actions.append(verify); }
    footer.append(actions); form.append(footer);
    const date = snapshot.updatedAt && new Date(snapshot.updatedAt).getTime();
    const meta = date ? `${t().savedAt} · ${new Intl.DateTimeFormat(locale() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(date))}` : t().initial;
    form.append(el('p', meta, 'admin-note'), el('p', t().nextVisit, 'admin-note'), el('p', t().cacheHint, 'admin-note')); container.append(form);
  }
  function reset() { epoch++; request++; snapshot = draft = null; loading = saving = conflict = uncertain = verifying = false; error = message = ''; }
  return { render, ensureLoaded: () => load(), dirty, isSaving: () => saving, leaveMessage: () => t().leaveConfirm, reset, destroy() { reset(); disposed = true; } };
}
