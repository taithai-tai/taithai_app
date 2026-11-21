import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function worker(file, origin = 'https://taithai.app') {
  const listeners = new Map();
  const stores = new Map([['chordly-v3', new Map([['/Chordly/', new Response('previously public app')]])], ['taithai-private-drive-v3', new Map()]]);
  const deleted = [];
  const cache = {
    delete: async request => { deleted.push(request.url); for (const store of stores.values()) store.delete(request.url); return true; },
    put: async (request, response) => { stores.get('current').set(request.url, response); },
  };
  stores.set('current', new Map());
  let upstream = async () => new Response('public asset');
  const context = {
    self: { location: { origin }, addEventListener: (name, callback) => listeners.set(name, callback), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    location: { origin }, URL, Response,
    caches: { keys: async () => [...stores.keys()].filter(key => key !== 'current'), delete: async key => stores.delete(key), open: async () => cache, match: async request => stores.get('current').get(request.url) || new Response('cached app') },
    fetch: (...args) => upstream(...args),
  };
  vm.runInNewContext(await readFile(new URL(file, import.meta.url), 'utf8'), context);
  return {
    stores, deleted,
    upstream: callback => { upstream = callback; },
    async activate() { let result; listeners.get('activate')({ waitUntil: value => { result = value; } }); await result; },
    async load(path, navigation = false) {
      let response;
      listeners.get('fetch')({ request: { url: origin + path, method: 'GET', mode: navigation ? 'navigate' : 'cors', destination: navigation ? 'document' : 'script' }, respondWith: value => { response = value; } });
      return response === undefined ? undefined : await response;
    },
  };
}

test('Chordly worker removes previous app caches and refuses an offline cached navigation', async () => {
  const sw = await worker('../chordly/public/sw.js');
  await sw.activate();
  assert.equal(sw.stores.has('chordly-v3'), false);
  sw.upstream(async () => { throw new Error('offline'); });
  const response = await sw.load('/Chordly/', true);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.doesNotMatch(await response.text(), /previously public app|cached app/);
});

test('Chordly worker caches public static assets, but deletes cached assets on a private/no-store response', async () => {
  const sw = await worker('../chordly/public/sw.js');
  await sw.load('/Chordly/_next/static/app.js');
  assert.equal(sw.stores.get('current').size, 1);
  sw.upstream(async () => new Response('owner-only script', { headers: { 'Cache-Control': 'private, no-store' } }));
  await sw.load('/Chordly/_next/static/app.js');
  assert.equal(sw.stores.get('current').size, 0);
  assert.ok(sw.deleted.includes('https://taithai.app/Chordly/_next/static/app.js'));
  await sw.load('/Chordly/', true);
  assert.equal(sw.stores.get('current').size, 0);
});

test('Private Drive worker removes old shell caches and never replays a shell when offline', async () => {
  const sw = await worker('../Private Drive/sw.js');
  await sw.activate();
  assert.equal(sw.stores.has('taithai-private-drive-v3'), false);
  sw.upstream(async () => { throw new Error('offline'); });
  const response = await sw.load('/Private%20Drive/', true);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(await sw.load('/firebase-auth.js'), undefined);
});
