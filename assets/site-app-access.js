import { resolveApp } from './site-app-catalog.js';
import { isAppOwner } from './site-owner-session.js';

export function safeAppReturnPath(value, origin) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value, origin), app = resolveApp(url.pathname);
    if (url.origin !== origin || !app || /^\/api\//i.test(url.pathname) || /\.(?!html$)[a-z0-9]+$/i.test(url.pathname)) return null;
    return { app, path: url.pathname + url.search + url.hash };
  } catch { return null; }
}

export async function initAppAccess({ win = window, doc = document, loadAuth = () => import('/firebase-auth.js?v=20260725-2') } = {}) {
  const node = id => doc.getElementById(id);
  const destination = safeAppReturnPath(new URLSearchParams(win.location.search).get('next'), win.location.origin);
  let auth, user = null, epoch = 0, busy = false, error = false, disposed = false, authTimer, unsubscribe = () => {};
  const th = () => win.TaithaiPreferences?.get().language !== 'en';
  const say = (a, b) => th() ? a : b;
  function render(message) {
    node('appAccessPanel').setAttribute('aria-busy', String(busy));
    node('appAccessName').textContent = destination ? destination.app.name[th() ? 'th' : 'en'] : '';
    node('appAccessSignIn').textContent = say('เข้าสู่ระบบด้วย Google', 'Sign in with Google');
    node('appAccessRetry').textContent = say('ลองอีกครั้ง', 'Try again');
    node('appAccessSwitch').textContent = say('เปลี่ยนบัญชี', 'Switch account');
    node('appAccessContinue').textContent = say('ลองเปิดแอปอีกครั้ง', 'Try opening the app again');
    node('appAccessSignIn').hidden = !destination || !auth || Boolean(user) || busy;
    node('appAccessSwitch').hidden = !destination || !user || busy;
    node('appAccessRetry').hidden = !destination || !error || busy;
    node('appAccessContinue').hidden = !destination || busy;
    if (destination) node('appAccessContinue').href = destination.path;
    node('appAccessHint').textContent = destination ? destination.app.locked ? say('Private Drive จำกัดเฉพาะบัญชีเจ้าของที่ยืนยันแล้ว และไม่สามารถเปิดเป็นแอปสาธารณะจากหน้าจัดการแอปได้', 'Private Drive is restricted to the verified owner and cannot be made public in Manage apps.') : say('โหมดนี้ให้เฉพาะบัญชีเจ้าของที่ยืนยันแล้วเข้าใช้งาน หากต้องการให้คนอื่นทดลอง ให้เจ้าของเปลี่ยนเป็นซ่อนจากรายการในหน้าจัดการแอป', 'Only the verified owner can open this mode. To let others test it through a link, the owner can choose Unlisted in Manage apps.') : '';
    node('appAccessStatus').textContent = message || (!destination ? say('ลิงก์เข้าแอปไม่ถูกต้อง กรุณากลับไปเลือกแอปอีกครั้ง', 'This app link is invalid. Return to the app collection.') : busy ? say('กำลังตรวจสอบสิทธิ์เข้าแอป…', 'Checking app access…') : error ? say('ตรวจสอบสิทธิ์ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', 'Access could not be verified. Check your connection and try again.') : user ? say('บัญชีนี้ไม่มีสิทธิ์เปิดแอปทดสอบ คุณสามารถเปลี่ยนบัญชีหรือกลับไปใช้แอปที่เผยแพร่อยู่', 'This account cannot open the test app. Switch accounts or browse the published apps.') : say('แอปนี้ยังไม่เปิดให้คนทั่วไปใช้งาน เข้าสู่ระบบด้วยบัญชีเจ้าของเพื่อทดสอบ', 'This app is not publicly available. Sign in with the owner account to test it.'));
  }
  async function authorize(currentUser, currentEpoch) {
    busy = true; error = false; render();
    try {
      const ready = await auth.refreshOwnerAppSession(currentUser);
      if (disposed || epoch !== currentEpoch) return;
      if (!ready) throw Error('ACCOUNT_CHANGED');
      win.location.replace(destination.path);
    } catch {
      if (disposed || epoch !== currentEpoch) return;
      busy = false; error = true; render();
    }
  }
  async function start() {
    const request = ++epoch; busy = true; error = false; render();
    win.clearTimeout(authTimer);
    authTimer = win.setTimeout(() => { if (!disposed && epoch === request) { busy = false; error = true; render(); } }, 12000);
    try {
      auth = await loadAuth(); if (disposed || request !== epoch) return;
      unsubscribe(); unsubscribe = auth.subscribeAuth(next => {
        if (disposed) return;
        win.clearTimeout(authTimer);
        const currentEpoch = ++epoch; user = next; busy = false; error = false;
        if (destination && isAppOwner(next)) void authorize(next, currentEpoch); else render();
      });
    } catch { if (!disposed && request === epoch) { win.clearTimeout(authTimer); busy = false; error = true; render(); } }
  }
  node('appAccessSignIn').addEventListener('click', async () => {
    if (!auth || busy) return; busy = true; render();
    try { await auth.loginWithGoogle(); } catch { busy = false; error = true; render(say('เข้าสู่ระบบไม่สำเร็จ คุณสามารถลองใหม่ได้', 'Sign-in did not finish. You can try again.')); }
  });
  node('appAccessSwitch').addEventListener('click', async () => {
    if (!auth || busy) return; busy = true; epoch++; render();
    try { await auth.logout(); } catch { busy = false; error = true; render(); }
  });
  node('appAccessRetry').addEventListener('click', () => { if (isAppOwner(user) && auth) void authorize(user, ++epoch); else void start(); });
  const relabel = () => render(); win.addEventListener('taithai:preferences', relabel);
  if (destination) await start(); else render();
  return { destroy() { disposed = true; epoch++; win.clearTimeout(authTimer); unsubscribe(); win.removeEventListener('taithai:preferences', relabel); } };
}
if (typeof window !== 'undefined' && document.body?.dataset.page === 'app-access') void initAppAccess();
