/* Connected Taithai service pages. Local preferences are distinct from submitted reports. */
const preferences = window.TaithaiPreferences;
const page = document.body.dataset.page;
const lang = () => preferences?.get().language === 'th' ? 'th' : 'en';
const say = (th, en) => lang() === 'th' ? th : en;
function translate() {
  document.querySelectorAll('[data-th][data-en]').forEach(el => { el.textContent = el.dataset[lang()]; });
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === lang())));
  const heading = document.querySelector('h1 [data-th]');
  if (heading) document.title = heading.textContent + ' · Taithai';
}
window.addEventListener('taithai:preferences', translate);
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => preferences.set({language:button.dataset.language})));
const year = document.getElementById('footerYear'); if (year) year.textContent = new Date().getFullYear();
function connection() { const note = document.getElementById('offlineNotice'); if (note) note.hidden = navigator.onLine !== false; }
window.addEventListener('online', connection); window.addEventListener('offline', connection); connection(); translate();
export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
if (page === 'settings') {
  const status = document.getElementById('settingsMessage');
  function announce(th, en, error = false) { status.textContent = say(th, en); status.hidden = false; status.classList.toggle('notice-error', error); }
  function sync() {
    const values = preferences.get();
    document.querySelectorAll('[data-pref]').forEach(button => button.setAttribute('aria-pressed', String(values[button.dataset.pref] === button.dataset.value)));
    const saved = document.getElementById('preferenceSaveState');
    saved.textContent = preferences.storageAvailable() ? say('บันทึกบนอุปกรณ์นี้', 'Saved on this device') : say('ใช้ได้เฉพาะครั้งนี้ เบราว์เซอร์ไม่ให้บันทึก', 'Session only: browser storage is unavailable');
    const consent = window.TaithaiAnalytics?.getConsent();
    document.querySelectorAll('[data-consent]').forEach(button => button.setAttribute('aria-pressed', String(consent === button.dataset.consent)));
    document.getElementById('consentState').textContent = consent === 'granted' ? say('อนุญาตสถิติการใช้งานแล้ว ถอนความยินยอมได้ทุกเมื่อ', 'Analytics allowed. You can withdraw at any time.') : consent === 'denied' ? say('ไม่ส่งสถิติการใช้งาน ใช้เว็บไซต์ได้ตามปกติ', 'Analytics declined. The website remains usable.') : say('ยังไม่ได้เลือก จึงยังไม่เริ่มเก็บสถิติ', 'No choice yet, so tracking has not started.');
  }
  document.querySelectorAll('[data-pref]').forEach(button => button.addEventListener('click', () => { preferences.set({[button.dataset.pref]:button.dataset.value}); sync(); }));
  document.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click', () => { window.TaithaiAnalytics?.setConsent(button.dataset.consent); sync(); }));
  document.getElementById('exportPreferences').addEventListener('click', () => { downloadText('taithai-settings.json', JSON.stringify(preferences.exportData(), null, 2)); announce('ดาวน์โหลดไฟล์การตั้งค่าแล้ว', 'Settings file downloaded'); });
  document.getElementById('importPreferences').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 16384) throw new Error('size'); const value = await file.text(); preferences.importData(value); sync(); announce('นำเข้าการตั้งค่าแล้ว', 'Settings imported'); }
    catch { announce('ไฟล์ไม่ใช่การตั้งค่า Taithai ที่รองรับ หรือไฟล์ใหญ่เกินไป ค่าปัจจุบันยังอยู่', 'This is not a supported Taithai settings file, or it is too large. Your settings are unchanged.', true); }
    finally { event.target.value = ''; }
  });
  document.getElementById('resetPreferences').addEventListener('click', () => {
    if (!confirm(say('คืนค่าธีม สี ภาษา ขนาดข้อความ และการเคลื่อนไหวหรือไม่ ข้อมูลแอปและความยินยอมสถิติจะยังอยู่', 'Reset theme, color, language, text size and motion? App data and analytics consent will be kept.'))) return;
    preferences.reset(); sync(); announce('คืนค่าหน้าตาเริ่มต้นแล้ว ข้อมูลแอปยังอยู่', 'Appearance reset. Your app data is kept.');
  });
  window.addEventListener('taithai:preferences', sync); window.addEventListener('taithai:consent', sync); window.addEventListener('taithai:analytics-ready', sync); sync();
}
if (page === 'help') {
  const search = document.getElementById('helpSearch');
  function filter() { const term = search.value.trim().toLocaleLowerCase(); let count = 0; document.querySelectorAll('[data-help-card]').forEach(card => { card.hidden = !card.textContent.toLocaleLowerCase().includes(term); if (!card.hidden) count++; }); document.getElementById('helpNoResults').hidden = count > 0; }
  search.addEventListener('input', filter); window.addEventListener('taithai:preferences', filter);
}
if (page === 'support') import('./site-support.js').catch(() => { const status = document.getElementById('reportStatus'); status.hidden = false; status.classList.add('notice-error'); status.textContent = say('โหลดแบบฟอร์มไม่สำเร็จ โปรดรีเฟรชเมื่อเชื่อมต่ออินเทอร์เน็ต', 'The form could not load. Reconnect and refresh the page.'); });

if (page === 'home') {
  const search=document.getElementById('appSearch'), clear=document.getElementById('clearAppSearch');
  const cards=[...document.querySelectorAll('.apps-grid > .app-card')];
  function filterApps(){const term=search.value.trim().toLocaleLowerCase();let count=0;for(const card of cards){card.hidden=!card.textContent.toLocaleLowerCase().includes(term);if(!card.hidden)count++;}clear.hidden=!term;document.getElementById('appSearchEmpty').hidden=count>0;document.getElementById('appSearchCount').textContent=term?say(`พบ ${count} จาก ${cards.length} แอป`,`${count} of ${cards.length} apps`):say(`${cards.length} แอป พร้อมให้เลือกใช้`,`${cards.length} apps to choose from`);}
  search.addEventListener('input',filterApps);clear.addEventListener('click',()=>{search.value='';filterApps();search.focus();});
  window.addEventListener('taithai:preferences',()=>queueMicrotask(filterApps));filterApps();
}
