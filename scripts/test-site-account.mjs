import test from 'node:test';
import assert from 'node:assert/strict';
import { initAccountPage, normalizeDisplayName, authErrorMessage } from '../assets/site-account.js';

class Element {
  constructor(tag, document) { this.tagName = tag; this.document = document; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = {}; this.hidden = false; this.disabled = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async fire(name, event = {}) { await Promise.all((this.listeners[name] || []).map(callback => callback({ preventDefault() {}, ...event }))); }
  focus() { this.document.activeElement = this; }
  remove() { this.removed = true; }
}
function createDOM(language = 'en') {
  let currentLanguage = language;
  const document = { documentElement: { lang: language }, activeElement: null };
  const root = new Element('section', document); root.id = 'accountPanel';
  document.createElement = tag => new Element(tag, document);
  document.getElementById = id => {
    function find(element) { if (element.id === id) return element; for (const child of element.children) { const result = find(child); if (result) return result; } return null; }
    return find(root);
  };
  const events = new EventTarget();
  const window = {
    document, navigator: { onLine: true }, setTimeout, clearTimeout, CustomEvent,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    TaithaiPreferences: { get: () => ({ language: currentLanguage }) },
  };
  return { root, document, window, language(value) { currentLanguage = value; window.dispatchEvent(new CustomEvent('taithai:preferences')); } };
}
const person = () => ({ uid: 'u1', displayName: 'Taithai', email: 'test@example.com', emailVerified: true, providerData: [{ providerId: 'google.com' }], metadata: { creationTime: '2026-01-01T12:00:00Z', lastSignInTime: '2026-11-21T05:00:00Z' } });
async function setup(user = null, options = {}) {
  const dom = createDOM(); let callback;
  const auth = {
    subscribeAuth(fn) { callback = fn; fn(user); return () => {}; },
    async loginWithGoogle() { user ||= person(); callback(user); return user; },
    async logout() { user = null; callback(null); },
  };
  const controller = await initAccountPage({ ...dom, loadAuth: async () => auth, loadUpdater: async () => ({ updateProfile: async (target, changes) => Object.assign(target, changes) }), ...options });
  return { ...dom, auth, controller, notify: value => { user = value; callback(value); } };
}

test('display names are trimmed, Unicode-safe, bounded, and reject controls', () => {
  assert.equal(normalizeDisplayName('  ไทย  '), 'ไทย');
  assert.equal(normalizeDisplayName('😀'.repeat(80)), '😀'.repeat(80));
  assert.throws(() => normalizeDisplayName('😀'.repeat(81)), /NAME_LENGTH/);
  assert.throws(() => normalizeDisplayName('  '), /NAME_LENGTH/);
  assert.throws(() => normalizeDisplayName('line\nbreak'), /NAME_CONTROL/);
});

test('specific auth errors are readable and never expose raw backend messages', () => {
  assert.match(authErrorMessage({ code: 'auth/popup-blocked' }), /pop-ups/);
  assert.match(authErrorMessage({ code: 'auth/popup-closed-by-user' }), /cancelled/);
  assert.match(authErrorMessage({ code: 'auth/network-request-failed' }, 'en', false), /offline/);
  assert.doesNotMatch(authErrorMessage({ message: 'secret backend detail' }), /secret/);
  assert.match(authErrorMessage({ code: 'auth/popup-blocked' }, 'th'), /ป๊อปอัป/);
});

test('signed-out users can sign in and sign out with the existing auth interface', async () => {
  const app = await setup();
  assert.ok(app.document.getElementById('accountSignIn'));
  assert.equal(app.document.getElementById('accountProfileForm'), null);
  await app.document.getElementById('accountSignIn').fire('click');
  assert.ok(app.document.getElementById('accountProfileForm'));
  assert.equal(app.document.getElementById('accountDisplayName').value, 'Taithai');
  await app.document.getElementById('accountSignOut').fire('click');
  assert.ok(app.document.getElementById('accountSignIn'));
  assert.equal(app.document.getElementById('accountProfileForm'), null);
  assert.match(app.document.getElementById('accountStatus').textContent, /signed out/);
  app.controller.destroy();
});

test('invalid names stay in the form, surface errors, focus the field, and do not save', async () => {
  let writes = 0;
  const app = await setup(person(), { loadUpdater: async () => ({ updateProfile: async () => writes++ }) });
  const input = app.document.getElementById('accountDisplayName');
  input.value = ''; await input.fire('input');
  await app.document.getElementById('accountProfileForm').fire('submit');
  assert.equal(writes, 0);
  assert.equal(input.attributes['aria-invalid'], 'true');
  assert.equal(app.document.activeElement, input);
  assert.match(app.document.getElementById('accountStatus').textContent, /1–80/);
  app.controller.destroy();
});

test('a valid name is persisted with updateProfile; unsafe-looking names render only as text', async () => {
  const user = person(); const calls = [];
  const app = await setup(user, { loadUpdater: async () => ({ updateProfile: async (target, data) => { calls.push(data); Object.assign(target, data); } }) });
  const input = app.document.getElementById('accountDisplayName');
  input.value = '  <img src=x onerror=alert(1)>  '; await input.fire('input');
  await app.document.getElementById('accountProfileForm').fire('submit');
  assert.deepEqual(calls, [{ displayName: '<img src=x onerror=alert(1)>' }]);
  assert.equal(user.displayName, '<img src=x onerror=alert(1)>');
  assert.equal(app.document.getElementById('accountDisplayName').value, user.displayName);
  assert.equal(app.document.getElementById('accountUnsaved').hidden, true);
  assert.match(app.document.getElementById('accountStatus').textContent, /saved/);
  app.controller.destroy();
});

test('switching language preserves an unsaved profile draft', async () => {
  const app = await setup(person());
  const input = app.document.getElementById('accountDisplayName');
  input.value = 'ชื่อใหม่'; await input.fire('input');
  app.language('th');
  assert.equal(app.document.getElementById('accountDisplayName').value, 'ชื่อใหม่');
  assert.equal(app.document.getElementById('accountUnsaved').hidden, false);
  assert.equal(app.document.getElementById('accountSaveProfile').textContent, 'บันทึกชื่อ');
  app.controller.destroy();
});

test('account changed while a profile operation loads cannot save into another account', async () => {
  let release; let writes = 0;
  const app = await setup(person(), { loadUpdater: () => new Promise(resolve => { release = () => resolve({ updateProfile: async () => writes++ }); }) });
  const input = app.document.getElementById('accountDisplayName');
  input.value = 'New name'; await input.fire('input');
  const operation = app.document.getElementById('accountProfileForm').fire('submit');
  app.notify({ ...person(), uid: 'other' });
  release(); await operation;
  assert.equal(writes, 0);
  assert.match(app.document.getElementById('accountStatus').textContent, /account changed/);
  app.controller.destroy();
});

test('blocked SDK loading renders a retry action rather than a dead account page', async () => {
  const app = await setup(null, { loadAuth: async () => { throw new Error('blocked'); } });
  assert.ok(app.document.getElementById('accountRetry'));
  assert.equal(app.root.attributes['aria-busy'], 'false');
  app.controller.destroy();
});
