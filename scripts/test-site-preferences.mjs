import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/site-preferences.js', import.meta.url), 'utf8');
const KEY = 'taithai.preferences.v1';
const defaults = { theme: 'system', accent: 'terracotta', fontSize: 'default', reduceMotion: 'system', language: 'en' };
const plain = value => JSON.parse(JSON.stringify(value));
const backup = preferences => JSON.stringify({ version: 1, preferences: { ...defaults, ...preferences } });

function setup({ saved = {}, dark = false, reduced = false, blockedRead = false, blockedWrite = false, oldMediaAPI = false } = {}) {
  const data = new Map(Object.entries(saved));
  const attrs = new Map();
  const handlers = new Map();
  const events = [];
  const media = new Map();
  const window = {
    localStorage: {
      getItem(key) { if (blockedRead) throw new Error('SecurityError'); return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { if (blockedWrite) throw new Error('QuotaExceededError'); data.set(key, String(value)); }
    },
    matchMedia(expression) {
      const callbacks = [];
      const query = {
        matches: expression.includes('color-scheme') ? dark : reduced,
        fire(matches) { query.matches = matches; callbacks.forEach(callback => callback({ matches })); }
      };
      if (oldMediaAPI) query.addListener = callback => callbacks.push(callback);
      else query.addEventListener = (_type, callback) => callbacks.push(callback);
      media.set(expression, query);
      return query;
    },
    addEventListener(type, handler) { handlers.set(type, handler); },
    dispatchEvent(event) { events.push(event); }
  };
  const document = { documentElement: { setAttribute(key, value) { attrs.set(key, value); }, style: {} } };
  const context = vm.createContext({ window, document, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(source, context);
  return {
    api: window.TaithaiPreferences, data, attrs, events, media, window, document, context,
    storage(key, newValue) {
      if (key === null) data.clear();
      else if (newValue === null) data.delete(key);
      else data.set(key, newValue);
      handlers.get('storage')({ key, newValue });
    }
  };
}

test('applies defaults before UI boot and exports only preference schema', () => {
  const { api, attrs, data, document } = setup({ saved: { userToken: 'do-not-export', movieRecords: '[1,2]' } });
  assert.deepEqual(plain(api.get()), defaults);
  assert.deepEqual(plain(api.exportData()), { version: 1, preferences: defaults });
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(attrs.get('data-accent'), 'terracotta');
  assert.equal(attrs.get('data-font-size'), 'default');
  assert.equal(attrs.get('data-motion'), 'default');
  assert.equal(document.documentElement.style.colorScheme, 'light');
  assert.equal(data.get('userToken'), 'do-not-export');
  assert.equal(data.has(KEY), false, 'initialization must not mutate storage');
});

test('system themes and motion follow OS changes and old browser listener API', () => {
  for (const oldMediaAPI of [false, true]) {
    const { api, attrs, media, events } = setup({ dark: true, reduced: true, oldMediaAPI });
    assert.equal(attrs.get('data-theme'), 'dark');
    assert.equal(attrs.get('data-motion'), 'reduce');
    media.get('(prefers-color-scheme: dark)').fire(false);
    media.get('(prefers-reduced-motion: reduce)').fire(false);
    assert.equal(attrs.get('data-theme'), 'light');
    assert.equal(attrs.get('data-motion'), 'default');
    assert.equal(api.get().theme, 'system');
    assert.equal(events.at(-1).type, 'taithai:preferences');
    assert.equal(events.at(-1).detail.source, 'system');
  }
});

test('explicit choices survive OS changes and persist both language and appearance', () => {
  const { api, attrs, media, data, events } = setup();
  const value = api.set({ theme: 'light', accent: 'green', fontSize: 'large', reduceMotion: 'reduce', language: 'th' });
  assert.deepEqual(plain(value), { theme: 'light', accent: 'green', fontSize: 'large', reduceMotion: 'reduce', language: 'th' });
  media.get('(prefers-color-scheme: dark)').fire(true);
  media.get('(prefers-reduced-motion: reduce)').fire(false);
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(attrs.get('data-motion'), 'reduce');
  assert.equal(attrs.get('lang'), 'th');
  assert.equal(data.get('taithaiLang'), 'th');
  assert.deepEqual(JSON.parse(data.get(KEY)), { version: 1, preferences: plain(value) });
  assert.equal(events[0].detail.persisted, true);
});

test('loads saved appearance while honoring legacy Taithai language', () => {
  const { api, attrs } = setup({ saved: { [KEY]: backup({ theme: 'dark', language: 'en' }), taithaiLang: 'th' } });
  assert.equal(api.get().theme, 'dark');
  assert.equal(api.get().language, 'th');
  assert.equal(attrs.get('lang'), 'th');
});

test('damaged, obsolete and invalid saved preferences fall back safely', () => {
  for (const raw of ['{broken', 'null', '[]', '{"version":2,"preferences":{}}', backup({ theme: 'purple' }), backup({ fontSize: 'huge' })]) {
    const { api } = setup({ saved: { [KEY]: raw, taithaiLang: 'invalid' } });
    assert.deepEqual(plain(api.get()), defaults);
  }
});

test('blocked reads or writes keep usable in-memory preferences and expose persistence state', () => {
  for (const flags of [{ blockedRead: true, blockedWrite: true }, { blockedWrite: true }]) {
    const { api, attrs, events } = setup(flags);
    assert.doesNotThrow(() => api.set({ theme: 'dark', language: 'th' }));
    assert.equal(api.get().theme, 'dark');
    assert.equal(attrs.get('data-theme'), 'dark');
    assert.equal(api.storageAvailable(), false);
    assert.equal(events.at(-1).detail.persisted, false);
  }
});

test('set rejects invalid fields atomically without changing UI or storage', () => {
  const { api, data, events } = setup();
  for (const invalid of [null, [], 'dark', { theme: 'auto' }, { language: 'de' }, { theme: 'dark', token: 'secret' }, { reduceMotion: false }, JSON.parse('{"__proto__":"bad"}')]) {
    assert.throws(() => api.set(invalid));
    assert.deepEqual(plain(api.get()), defaults);
    assert.equal(data.has(KEY), false);
    assert.equal(events.length, 0);
  }
});

test('backups round-trip validated settings without app data', () => {
  const first = setup();
  first.api.set({ theme: 'dark', accent: 'blue', language: 'th' });
  const second = setup({ saved: { movieRecords: '[42]' } });
  second.api.importData(JSON.stringify(first.api.exportData()));
  assert.deepEqual(plain(second.api.get()), plain(first.api.get()));
  assert.equal(second.data.get('movieRecords'), '[42]');
  assert.equal(second.events.at(-1).detail.source, 'import');
});

test('import rejects wrong schema, extra data, partial, poisoned and future backups', () => {
  const { api } = setup();
  const invalid = [
    '{', null, [], defaults, { version: 2, preferences: defaults },
    { version: 1, preferences: { theme: 'dark' } },
    { version: 1, preferences: { ...defaults, theme: 'auto' } },
    { version: 1, preferences: defaults, token: 'do-not-import' },
    { version: 1, preferences: { ...defaults, token: 'do-not-import' } },
    Object.assign(Object.create({ version: 1 }), { preferences: defaults, extra: true }),
    JSON.parse('{"version":1,"preferences":{"theme":"system","accent":"terracotta","fontSize":"default","reduceMotion":"system","__proto__":"x"}}')
  ];
  for (const value of invalid) {
    assert.throws(() => api.importData(value));
    assert.deepEqual(plain(api.get()), defaults);
  }
});

test('cross-tab appearance and legacy language sync update UI without write loops', () => {
  const { api, attrs, data, events, storage } = setup();
  storage(KEY, backup({ theme: 'dark', accent: 'blue', language: 'th' }));
  assert.equal(api.get().theme, 'dark');
  assert.equal(attrs.get('data-accent'), 'blue');
  assert.equal(data.has('taithaiLang'), false, 'storage listener must not write legacy key');
  storage('taithaiLang', 'en');
  assert.equal(api.get().language, 'en');
  assert.equal(attrs.get('lang'), 'en');
  assert.equal(events.at(-1).detail.source, 'storage');
  assert.equal(JSON.parse(data.get(KEY)).preferences.language, 'th', 'listener must not rewrite appearance key');
});

test('invalid cross-tab data and unrelated keys cannot erase current choices', () => {
  const { api, storage, events } = setup();
  api.set({ theme: 'dark' });
  const count = events.length;
  storage(KEY, '{broken');
  storage('taithaiLang', 'xx');
  storage('movieRecords', '[]');
  assert.equal(api.get().theme, 'dark');
  assert.equal(api.get().language, 'en');
  assert.equal(events.length, count);
});

test('storage removal and clear restore defaults without deleting other records', () => {
  const { api, storage, attrs } = setup();
  api.set({ theme: 'dark', language: 'th' });
  storage(KEY, null);
  assert.equal(api.get().theme, 'system');
  assert.equal(api.get().language, 'th');
  storage('taithaiLang', null);
  assert.equal(api.get().language, 'en');
  api.set({ theme: 'dark' });
  storage(null, null);
  assert.deepEqual(plain(api.get()), defaults);
  assert.equal(attrs.get('data-theme'), 'light');
});

test('reset touches only preference keys and returns independent copies', () => {
  const { api, data } = setup({ saved: { 'private-drive-access': 'preserve', movieRecords: '[42]' } });
  api.set({ theme: 'dark', language: 'th' });
  const result = api.reset();
  assert.deepEqual(plain(result), defaults);
  result.theme = 'dark';
  const snapshot = api.get();
  snapshot.accent = 'blue';
  const exported = api.exportData();
  exported.preferences.language = 'th';
  assert.deepEqual(plain(api.get()), defaults);
  assert.equal(data.get('private-drive-access'), 'preserve');
  assert.equal(data.get('movieRecords'), '[42]');
});

test('loading script twice keeps one API instance and listener wiring', () => {
  const { api, window, context } = setup();
  api.set({ accent: 'green' });
  vm.runInContext(source, context);
  assert.equal(window.TaithaiPreferences, api);
  assert.equal(api.get().accent, 'green');
});
