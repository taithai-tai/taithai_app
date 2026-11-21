import { isAppOwner } from './site-owner-session.js';

/** Owner navigation is hidden in HTML and remains closed until Firebase verifies the owner. */
export function initOwnerUI({ win = globalThis.window, doc = win?.document, loadAuth = () => import('/firebase-auth.js?v=20260725-2') } = {}) {
  if (!win || !doc || !doc.querySelector('[data-owner-only]')) return null;
  if (doc.body.dataset.ownerUiInitialized) return null;
  doc.body.dataset.ownerUiInitialized = 'true';
  let generation = 0, disposed = false, unsubscribe = () => {};
  function showOwnerLinks(user) {
    const allowed = isAppOwner(user);
    doc.querySelectorAll('[data-owner-only]').forEach(node => { node.hidden = !allowed; });
  }
  function suspend() {
    generation++; unsubscribe(); unsubscribe = () => {}; showOwnerLinks(null);
  }
  async function start() {
    suspend(); const current = generation;
    try {
      const auth = await loadAuth();
      if (disposed || current !== generation) return;
      unsubscribe = auth.subscribeAuth(user => {
        if (!disposed && current === generation) showOwnerLinks(user);
      });
    } catch { if (!disposed && current === generation) showOwnerLinks(null); }
  }
  function restore(event) { if (event.persisted && !disposed) void start(); }
  win.addEventListener('pagehide', suspend); win.addEventListener('pageshow', restore);
  void start();
  return { destroy() { disposed = true; suspend(); win.removeEventListener('pagehide', suspend); win.removeEventListener('pageshow', restore); delete doc.body.dataset.ownerUiInitialized; } };
}
if (typeof window !== 'undefined') initOwnerUI();
