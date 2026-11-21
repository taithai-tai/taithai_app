import { resolveApp, getPublicApps } from './site-app-catalog.js';

/** Discovery follows the server policy, including search counts and every hero shortcut. */
export async function initHomeApps({ win = window, doc = document, loadSettings = async () => (await import('./site-data.js')).getAppVisibilitySettings() } = {}) {
  const directory = doc.getElementById('appDirectory');
  if (!directory) return;
  const cards = [...doc.querySelectorAll('.apps-grid > .app-card')];
  const shortcuts = [...doc.querySelectorAll('.toolkit-item')];
  const toolkit = doc.querySelector('.toolkit');
  const error = doc.getElementById('appCatalogError');
  const retry = doc.getElementById('reloadAppCatalog');
  let request = 0, disposed = false, lastSettings = null;
  function publish(settings) {
    const ids = new Set(settings ? getPublicApps(settings).map(app => app.id) : []);
    for (const card of cards) {
      const app = resolveApp(card.getAttribute('href'));
      // Relative links are resolved against the public homepage, never the current query.
      const resolved = app || resolveApp(new URL(card.getAttribute('href'), win.location.origin + '/').pathname);
      card.dataset.catalogVisible = String(ids.has(resolved?.id));
      card.hidden = card.dataset.catalogVisible === 'false';
    }
    let shortcutCount = 0;
    for (const shortcut of shortcuts) {
      const app = resolveApp(new URL(shortcut.getAttribute('href'), win.location.origin + '/').pathname);
      shortcut.hidden = !ids.has(app?.id); if (!shortcut.hidden) shortcutCount++;
    }
    toolkit.hidden = shortcutCount === 0;
    doc.querySelector('.hero')?.classList.toggle('hero-tools-empty', shortcutCount === 0);
    directory.dataset.catalogPending = settings ? 'false' : 'true';
    directory.hidden = !settings;
    const empty = doc.getElementById('appCatalogEmpty'); if (empty) empty.hidden = !settings || ids.size > 0;
    const total = doc.querySelector('.stat-num'); if (total) total.textContent = settings ? String(ids.size) : '—';
    win.dispatchEvent(new win.CustomEvent('taithai:app-visibility'));
  }
  async function refresh() {
    const current = ++request; retry.disabled = true; error.hidden = true;
    try {
      const settings = await loadSettings();
      if (disposed || current !== request) return;
      if (!settings?.valid) throw Error('INVALID_CATALOG');
      lastSettings = settings; publish(settings);
    } catch {
      if (disposed || current !== request) return;
      lastSettings = null; publish(null); error.hidden = false;
      doc.getElementById('appSearchCount').textContent = win.TaithaiPreferences?.get().language === 'th' ? 'รายการแอปยังไม่พร้อม' : 'The app collection is unavailable';
    } finally { if (!disposed && current === request) retry.disabled = false; }
  }
  const visible = () => { if (!doc.hidden) void refresh(); };
  const relabel = () => { if (lastSettings) publish(lastSettings); };
  retry.addEventListener('click', refresh);
  win.addEventListener('focus', refresh); win.addEventListener('online', refresh);
  win.addEventListener('pageshow', visible); doc.addEventListener('visibilitychange', visible);
  win.addEventListener('taithai:preferences', relabel);
  publish(null); await refresh();
  return { refresh, destroy() { disposed = true; request++; retry.removeEventListener('click', refresh); win.removeEventListener('focus', refresh); win.removeEventListener('online', refresh); win.removeEventListener('pageshow', visible); doc.removeEventListener('visibilitychange', visible); win.removeEventListener('taithai:preferences', relabel); } };
}
if (typeof window !== 'undefined' && document.body?.dataset.page === 'home') void initHomeApps();
