// Taithai account page. Loads the existing Firebase session only when this page is used.
const AUTH_MODULE = '/firebase-auth.js?v=20260725-2';
const AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
const copy = {
  en: {
    loading: 'Checking your account…', retry: 'Try again', loadFailed: 'We could not load your account. Check your connection, then try again.',
    signedOutTitle: 'One account for Taithai', signedOutText: 'Sign in with Google to use account features in supported apps. Website appearance and language can also be set without signing in.',
    signIn: 'Sign in with Google', signingIn: 'Opening Google…', signOut: 'Sign out', signingOut: 'Signing out…',
    profile: 'Your profile', displayName: 'Display name', nameHint: '1–80 characters. This changes your name in Taithai, not your Google account.',
    save: 'Save name', saving: 'Saving…', nameRequired: 'Enter a display name using 1–80 characters.', nameControl: 'Use a name without control characters.',
    saved: 'Your display name has been saved', unchanged: 'Your display name is already up to date', unsaved: 'You have an unsaved name change',
    details: 'Account details', email: 'Email', provider: 'Sign-in method', verified: 'Email verification', verifiedYes: 'Verified by your sign-in provider', verifiedNo: 'Not verified',
    created: 'Account created', lastSignIn: 'Last sign-in', missing: 'Not available', google: 'Google', other: 'Other provider',
    emailNote: 'Your email, password, and Google profile are managed in your Google account.', googleAccount: 'Open Google account',
    session: 'Your session', sessionNote: 'Signing out ends the Taithai session in this browser. Your saved movies, files, and website preferences are kept.',
    appData: 'Your app data', appDataNote: 'Each app manages its own saved content. Signing in here does not move local files or browser data to the cloud.',
    movies: 'Movie Memory account', privacy: 'Privacy and data', support: 'Get help', settings: 'Website settings',
    cancelled: 'Sign-in was cancelled. You can try again whenever you are ready.', blocked: 'Google could not open. Allow pop-ups for this site, then try again.',
    offline: 'You appear to be offline. Reconnect and try again.', network: 'We could not reach Google. Check your connection and try again.',
    unauthorized: 'Sign-in is not available on this domain. Please open taithai.app or report the problem.',
    disabled: 'This account is unavailable. Contact support if you need help.', recentLogin: 'Please sign out and sign in again, then retry this change.',
    operation: 'That action could not be completed. Please try again.', notSignedIn: 'Sign in before changing your profile.', signedOut: 'You have signed out',
    discardSignOut: 'Discard your unsaved name change and sign out?', pending: 'Finish the Google sign-in window to continue', sessionChanged: 'Your account changed while saving. Check the active account and try again.',
  },
  th: {
    loading: 'กำลังตรวจสอบบัญชี…', retry: 'ลองอีกครั้ง', loadFailed: 'โหลดบัญชีไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    signedOutTitle: 'บัญชีเดียวสำหรับ Taithai', signedOutText: 'เข้าสู่ระบบด้วย Google เพื่อใช้ฟีเจอร์บัญชีในแอปที่รองรับ ส่วนธีมและภาษาของเว็บไซต์ตั้งค่าได้โดยไม่ต้องเข้าสู่ระบบ',
    signIn: 'เข้าสู่ระบบด้วย Google', signingIn: 'กำลังเปิด Google…', signOut: 'ออกจากระบบ', signingOut: 'กำลังออกจากระบบ…',
    profile: 'โปรไฟล์ของคุณ', displayName: 'ชื่อที่แสดง', nameHint: '1–80 ตัวอักษร เปลี่ยนชื่อใน Taithai โดยไม่เปลี่ยนชื่อบัญชี Google',
    save: 'บันทึกชื่อ', saving: 'กำลังบันทึก…', nameRequired: 'ระบุชื่อที่แสดง 1–80 ตัวอักษร', nameControl: 'ชื่อไม่สามารถมีอักขระควบคุมได้',
    saved: 'บันทึกชื่อที่แสดงแล้ว', unchanged: 'ชื่อที่แสดงเป็นชื่อปัจจุบันอยู่แล้ว', unsaved: 'มีชื่อที่แก้ไขแล้วยังไม่ได้บันทึก',
    details: 'ข้อมูลบัญชี', email: 'อีเมล', provider: 'วิธีเข้าสู่ระบบ', verified: 'การยืนยันอีเมล', verifiedYes: 'ยืนยันแล้วโดยผู้ให้บริการเข้าสู่ระบบ', verifiedNo: 'ยังไม่ยืนยัน',
    created: 'สร้างบัญชีเมื่อ', lastSignIn: 'เข้าสู่ระบบล่าสุด', missing: 'ไม่มีข้อมูล', google: 'Google', other: 'ผู้ให้บริการอื่น',
    emailNote: 'อีเมล รหัสผ่าน และโปรไฟล์ Google จัดการได้จากบัญชี Google ของคุณ', googleAccount: 'เปิดบัญชี Google',
    session: 'การเข้าสู่ระบบ', sessionNote: 'การออกจากระบบจะสิ้นสุดการเข้าสู่ระบบ Taithai ในเบราว์เซอร์นี้ โดยยังเก็บหนัง ไฟล์ และการตั้งค่าเว็บไซต์ไว้',
    appData: 'ข้อมูลในแอปของคุณ', appDataNote: 'แต่ละแอปจัดการข้อมูลของตัวเอง การเข้าสู่ระบบที่นี่ไม่ได้ย้ายไฟล์หรือข้อมูลในเบราว์เซอร์ขึ้นคลาวด์โดยอัตโนมัติ',
    movies: 'บัญชี Movie Memory', privacy: 'ความเป็นส่วนตัวและข้อมูล', support: 'ขอความช่วยเหลือ', settings: 'ตั้งค่าเว็บไซต์',
    cancelled: 'ยกเลิกการเข้าสู่ระบบแล้ว สามารถลองใหม่ได้เมื่อพร้อม', blocked: 'เปิดหน้าต่าง Google ไม่ได้ อนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง',
    offline: 'ขณะนี้ออฟไลน์ เชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง', network: 'เชื่อมต่อ Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
    unauthorized: 'โดเมนนี้ยังใช้ระบบเข้าสู่ระบบไม่ได้ กรุณาเปิด taithai.app หรือแจ้งปัญหา',
    disabled: 'บัญชีนี้ไม่พร้อมใช้งาน ติดต่อศูนย์ช่วยเหลือหากต้องการความช่วยเหลือ', recentLogin: 'กรุณาออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง ก่อนลองบันทึกใหม่',
    operation: 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง', notSignedIn: 'เข้าสู่ระบบก่อนเปลี่ยนโปรไฟล์', signedOut: 'ออกจากระบบแล้ว',
    discardSignOut: 'ยกเลิกชื่อที่ยังไม่ได้บันทึกและออกจากระบบหรือไม่', pending: 'ดำเนินการต่อในหน้าต่างเข้าสู่ระบบ Google', sessionChanged: 'บัญชีเปลี่ยนระหว่างบันทึก ตรวจสอบบัญชีที่ใช้งานแล้วลองอีกครั้ง',
  },
};

export function normalizeDisplayName(value) {
  const name = String(value ?? '').trim();
  if (!name || [...name].length > 80) throw new Error('NAME_LENGTH');
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) throw new Error('NAME_CONTROL');
  return name;
}

export function authErrorMessage(error, language = 'en', online = true) {
  const t = copy[language === 'th' ? 'th' : 'en'];
  if (!online) return t.offline;
  const code = error?.code || error?.message || '';
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code)) return t.cancelled;
  if (code === 'auth/popup-blocked') return t.blocked;
  if (code === 'auth/network-request-failed') return t.network;
  if (['auth/unauthorized-domain', 'AUTH_REQUIRES_HTTP'].includes(code)) return t.unauthorized;
  if (code === 'auth/user-disabled') return t.disabled;
  if (code === 'auth/requires-recent-login') return t.recentLogin;
  if (code === 'NAME_LENGTH') return t.nameRequired;
  if (code === 'NAME_CONTROL') return t.nameControl;
  return t.operation;
}

function safePhoto(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export async function initAccountPage(options = {}) {
  const win = options.window || globalThis.window;
  const doc = options.document || win?.document;
  const root = options.root || doc?.getElementById('accountPanel');
  if (!root) return null;
  if (root.dataset.accountInitialized) return null;
  root.dataset.accountInitialized = 'true';
  const loadAuth = options.loadAuth || (() => import(AUTH_MODULE));
  const loadUpdater = options.loadUpdater || (() => import(AUTH_SDK));
  const language = () => win.TaithaiPreferences?.get?.().language === 'th' || (!win.TaithaiPreferences && doc.documentElement.lang === 'th') ? 'th' : 'en';
  let authModule;
  let user = null;
  let checked = false;
  let failed = false;
  let busy = '';
  let draft = '';
  let dirty = false;
  let status = null;
  let unsubscribe = () => {};
  let disposed = false;
  let request = 0;
  let loadingTimer;

  const t = () => copy[language()];
  function element(tag, text, className) {
    const el = doc.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function link(text, href) {
    const a = element('a', text);
    a.href = href;
    return a;
  }
  function button(id, text, action, primary = false) {
    const b = element('button', text, `button ${primary ? 'button-primary' : 'button-secondary'}`);
    b.id = id;
    b.type = 'button';
    b.disabled = Boolean(busy);
    b.addEventListener('click', action);
    return b;
  }
  function panel(title, text) {
    const section = element('section', undefined, 'panel');
    if (title) section.append(element('h2', title));
    if (text) section.append(element('p', text, 'muted'));
    return section;
  }
  function showStatus() {
    const target = doc.getElementById('accountStatus');
    if (!target) return;
    target.textContent = status?.error ? authErrorMessage(status.error, language(), win.navigator?.onLine !== false) : (status?.key ? t()[status.key] : '');
    target.className = status?.error ? 'notice notice-error' : 'notice';
    target.hidden = !target.textContent;
  }
  function setStatus(key, error = null) {
    status = error ? { error } : { key };
    showStatus();
  }
  function date(value) {
    if (!value || !Number.isFinite(new Date(value).getTime())) return t().missing;
    return new Intl.DateTimeFormat(language() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
  }
  function render() {
    if (disposed) return;
    const text = t();
    root.replaceChildren();
    root.setAttribute('aria-busy', String(!checked && !failed || Boolean(busy)));
    if (!checked) {
      const loading = panel('', failed ? text.loadFailed : text.loading);
      loading.setAttribute('role', 'status');
      if (failed) loading.append(button('accountRetry', text.retry, start));
      root.append(loading);
      return;
    }
    const statusBox = element('p');
    statusBox.id = 'accountStatus';
    statusBox.setAttribute('role', 'status');
    statusBox.setAttribute('aria-live', 'polite');
    statusBox.setAttribute('aria-atomic', 'true');
    root.append(statusBox);
    if (!user) {
      const signedOut = panel(text.signedOutTitle, text.signedOutText);
      signedOut.append(button('accountSignIn', busy === 'signIn' ? text.signingIn : text.signIn, signIn, true));
      const settings = element('p');
      settings.append(link(text.settings, '/settings/'));
      signedOut.append(settings);
      root.append(signedOut);
    } else {
      const profile = panel(text.profile);
      const photo = safePhoto(user.photoURL);
      if (photo) {
        const image = element('img');
        image.src = photo;
        image.alt = '';
        image.width = 56;
        image.height = 56;
        image.style.borderRadius = '50%';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        profile.append(image);
      }
      const form = element('form');
      form.id = 'accountProfileForm';
      form.noValidate = true;
      const field = element('div', undefined, 'field');
      const label = element('label', text.displayName, 'field-label');
      label.htmlFor = 'accountDisplayName';
      const input = element('input');
      input.id = 'accountDisplayName';
      input.name = 'displayName';
      input.type = 'text';
      input.autocomplete = 'nickname';
      input.required = true;
      input.maxLength = 160; // Unicode validation counts code points, including surrogate pairs.
      input.value = draft;
      input.disabled = Boolean(busy);
      input.setAttribute('aria-describedby', 'accountNameHint accountUnsaved');
      const hint = element('p', text.nameHint, 'field-hint');
      hint.id = 'accountNameHint';
      const unsaved = element('p', text.unsaved, 'field-hint');
      unsaved.id = 'accountUnsaved';
      unsaved.hidden = !dirty;
      input.addEventListener('input', () => {
        draft = input.value;
        dirty = draft.trim() !== (user?.displayName || '');
        unsaved.hidden = !dirty;
        input.removeAttribute('aria-invalid');
      });
      field.append(label, input, hint, unsaved);
      const submit = element('button', busy === 'save' ? text.saving : text.save, 'button button-primary');
      submit.id = 'accountSaveProfile';
      submit.type = 'submit';
      submit.disabled = Boolean(busy);
      form.append(field, submit);
      form.addEventListener('submit', saveProfile);
      profile.append(form);
      root.append(profile);

      const details = panel(text.details);
      const list = element('dl', undefined, 'account-grid');
      const providers = [...new Set((user.providerData || []).map(item => item.providerId === 'google.com' ? text.google : text.other))].join(', ') || text.missing;
      for (const [labelText, value] of [[text.email, user.email || text.missing], [text.provider, providers], [text.verified, user.emailVerified ? text.verifiedYes : text.verifiedNo], [text.created, date(user.metadata?.creationTime)], [text.lastSignIn, date(user.metadata?.lastSignInTime)]]) {
        const row = element('div');
        row.append(element('dt', labelText), element('dd', value));
        list.append(row);
      }
      details.append(list, element('p', text.emailNote, 'field-hint'), link(text.googleAccount, 'https://myaccount.google.com/'));
      root.append(details);
      const session = panel(text.session, text.sessionNote);
      session.append(button('accountSignOut', busy === 'signOut' ? text.signingOut : text.signOut, signOut));
      root.append(session);
    }
    const dataPanel = panel(text.appData, text.appDataNote);
    const links = element('nav');
    links.setAttribute('aria-label', text.appData);
    links.style.display = 'flex';
    links.style.flexWrap = 'wrap';
    links.style.gap = '16px';
    links.append(link(text.movies, '/Movie-Memory/account/'), link(text.privacy, '/privacy/'), link(text.support, '/support/'));
    dataPanel.append(links);
    root.append(dataPanel);
    showStatus();
  }
  async function signIn() {
    if (busy || !authModule) return;
    busy = 'signIn'; status = null; render();
    try {
      const result = await authModule.loginWithGoogle();
      if (result) acceptUser(result);
      else setStatus('pending');
    } catch (error) { setStatus(null, error); }
    finally { busy = ''; render(); }
  }
  async function signOut() {
    if (busy || !authModule) return;
    if (dirty && typeof win.confirm === 'function' && !win.confirm(t().discardSignOut)) return;
    busy = 'signOut'; status = null; render();
    try {
      await authModule.logout();
      acceptUser(null);
      setStatus('signedOut');
    } catch (error) { setStatus(null, error); }
    finally { busy = ''; render(); }
  }
  async function saveProfile(event) {
    event.preventDefault();
    if (busy) return;
    if (!user) { setStatus('notSignedIn'); return; }
    const targetUser = user;
    let name;
    try { name = normalizeDisplayName(draft); }
    catch (error) {
      setStatus(null, error);
      const input = doc.getElementById('accountDisplayName');
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
      return;
    }
    if (name === (user.displayName || '')) { setStatus('unchanged'); return; }
    busy = 'save'; status = null; render();
    try {
      const sdk = await loadUpdater();
      if (user?.uid !== targetUser.uid) { setStatus('sessionChanged'); return; }
      await sdk.updateProfile(targetUser, { displayName: name });
      if (user?.uid !== targetUser.uid) { setStatus('sessionChanged'); return; }
      draft = name; dirty = false;
      setStatus('saved');
      win.dispatchEvent(new win.CustomEvent('taithai:account-updated', { detail: { displayName: name } }));
    } catch (error) { setStatus(null, error); }
    finally { busy = ''; render(); }
  }
  function acceptUser(nextUser) {
    if (disposed) return;
    win.clearTimeout(loadingTimer);
    checked = true; failed = false;
    const sameUser = user && nextUser && user.uid === nextUser.uid;
    user = nextUser;
    if (!sameUser || !dirty) { draft = user?.displayName || ''; dirty = false; }
    if (!sameUser) status = null;
    render();
  }
  async function start() {
    const currentRequest = ++request;
    unsubscribe(); unsubscribe = () => {};
    win.clearTimeout(loadingTimer);
    checked = false; failed = false; render();
    loadingTimer = win.setTimeout(() => { if (currentRequest === request && !checked && !disposed) { failed = true; render(); } }, 12000);
    try {
      const module = await loadAuth();
      if (currentRequest !== request || disposed) return;
      authModule = module;
      unsubscribe = module.subscribeAuth(next => { if (currentRequest === request) acceptUser(next); });
    } catch {
      if (currentRequest === request && !disposed) { win.clearTimeout(loadingTimer); failed = true; render(); }
    }
  }
  let lastLanguage = language();
  const languageChanged = () => {
    const nextLanguage = language();
    if (lastLanguage !== nextLanguage) { lastLanguage = nextLanguage; render(); }
  };
  const beforeUnload = event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  win.addEventListener('beforeunload', beforeUnload);
  win.addEventListener('taithai:preferences', languageChanged);
  await start();
  return {
    render,
    destroy() {
      disposed = true; request++;
      unsubscribe(); win.clearTimeout(loadingTimer);
      win.removeEventListener('taithai:preferences', languageChanged);
      win.removeEventListener('beforeunload', beforeUnload);
      delete root.dataset.accountInitialized;
    },
  };
}

if (typeof window !== 'undefined' && window.document?.getElementById('accountPanel')) {
  void initAccountPage();
}
