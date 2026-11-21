// Discovery filtering complements server access rules; it never edits report data.
import { APP_CATALOG } from './site-app-catalog.js';
const OWNER_EMAIL = 'taithai5002@gmail.com';
const COPY = {
  th: { loading: 'กำลังโหลดรายการแอป…', failed: 'โหลดรายการแอปไม่สำเร็จ ลิงก์แอปยังไม่แสดง กรุณาลองอีกครั้ง ส่วนอื่นของหน้านี้ยังใช้งานได้', retry: 'ลองโหลดรายการแอปอีกครั้ง' },
  en: { loading: 'Loading the app list…', failed: 'The app list could not load, so app links remain hidden. Try again. The rest of this page is still available.', retry: 'Retry the app list' },
};
export function isDiscoveryOwner(user) { return Boolean(user?.emailVerified === true && String(user.email || '').trim().toLowerCase() === OWNER_EMAIL); }
/** Known selected support topics remain available, even when the app is no longer listed. */
export function canDiscoverApp(appId, settings, { isOwner = false, selectedAppId = '' } = {}) {
  if (!APP_CATALOG.some(app => app.id === appId)) return false;
  if (appId === selectedAppId) return true;
  return Boolean(settings?.valid === true && (isOwner || settings.apps?.[appId]?.visibility === 'public'));
}
export function supportAppId(value) {
  const aliases = { 'Temporary Chat': 'temporary-chat', 'Public Drive': 'public-drive', 'Private Drive': 'private-drive' };
  return aliases[value] || APP_CATALOG.find(app => app.id === value || app.name.en === value || app.name.th === value)?.id || '';
}
export function initAppDiscovery({ window: win = globalThis.window, document: doc = win?.document,
  loadData = () => import('./site-data.js'), loadAuth = () => import('/firebase-auth.js?v=20260725-2') } = {}) {
  if (!doc || !win || doc.body?.dataset.appDiscoveryInitialized) return null;
  doc.body.dataset.appDiscoveryInitialized = 'true';
  const items = [...doc.querySelectorAll('[data-app-discovery]')];
  const shortcuts = [...doc.querySelectorAll('[data-owner-app-settings]')];
  const statuses = [...doc.querySelectorAll('[data-app-discovery-status]')];
  const groups = [...doc.querySelectorAll('[data-app-discovery-group]')];
  const help = doc.getElementById('helpGuides'); const support = doc.getElementById('reportApp');
  let queryApp = ''; try { queryApp = supportAppId(new URLSearchParams(win.location?.search || '').get('app') || ''); } catch {}
  let settings = null; let owner = false; let loading = false; let failed = false; let disposed = false; let request = 0; let unsubscribe = () => {};
  const language = () => win.TaithaiPreferences?.get?.().language === 'en' || !win.TaithaiPreferences && doc.documentElement.lang === 'en' ? 'en' : 'th';
  function renderStatus() {
    const text = COPY[language()];
    for (const status of statuses) {
      status.replaceChildren(); status.hidden = !loading && !failed;
      status.setAttribute('role', failed ? 'alert' : 'status');
      status.className = failed ? 'notice notice-error' : 'notice';
      if (!loading && !failed) continue;
      const message = doc.createElement('span'); message.textContent = failed ? text.failed : text.loading; status.append(message);
      if (failed) { const retry = doc.createElement('button'); retry.type = 'button'; retry.className = 'button button-secondary'; retry.textContent = text.retry; retry.addEventListener('click', reload); status.append(retry); }
    }
  }
  function render() {
    if (disposed) return;
    const selected = supportAppId(support?.value || '');
    for (const item of items) {
      const id = item.dataset.appDiscovery;
      const supportTopic = item.tagName?.toLowerCase() === 'option';
      const permitted = canDiscoverApp(id, settings, { isOwner: owner, selectedAppId: supportTopic ? selected || queryApp : '' }) || supportTopic && id === queryApp;
      item.dataset.discoveryVisible = String(permitted); item.hidden = !permitted;
      // Disabled options do not appear as accidental choices; preserve report selection and form locking.
      if (supportTopic) item.disabled = !permitted;
    }
    for (const group of groups) group.hidden = ![...group.querySelectorAll('[data-app-discovery]')].some(item => item.dataset.discoveryVisible === 'true');
    for (const shortcut of shortcuts) shortcut.hidden = !owner;
    if (help) { help.dataset.discoveryPending = String(loading); help.dataset.discoveryError = String(failed); }
    renderStatus(); win.dispatchEvent(new win.CustomEvent('taithai:app-discovery'));
  }
  async function reload() {
    if (disposed || loading) return;
    const current = ++request; loading = true; failed = false; settings = null; render();
    try {
      const source = await loadData(); const result = await source.getAppVisibilitySettings();
      if (disposed || current !== request) return;
      if (!result || result.valid !== true) throw new Error('Invalid app list');
      settings = result;
    } catch { if (!disposed && current === request) failed = true; }
    finally { if (!disposed && current === request) { loading = false; render(); } }
  }
  const preferencesChanged = () => render();
  const supportChanged = () => render();
  win.addEventListener('taithai:preferences', preferencesChanged); support?.addEventListener('change', supportChanged);
  // Preferences translate cards synchronously; reapply visibility after any shared page filter.
  render(); void reload();
  Promise.resolve().then(loadAuth).then(auth => {
    if (disposed) return;
    unsubscribe = auth.subscribeAuth(user => { if (disposed) return; owner = isDiscoveryOwner(user); render(); });
  }).catch(() => { if (!disposed) { owner = false; render(); } });
  return { reload, destroy() { disposed = true; request++; unsubscribe(); win.removeEventListener('taithai:preferences', preferencesChanged); support?.removeEventListener('change', supportChanged); delete doc.body.dataset.appDiscoveryInitialized; } };
}
if (typeof window !== 'undefined' && window.document?.querySelector('[data-app-discovery],[data-owner-app-settings]')) initAppDiscovery();
