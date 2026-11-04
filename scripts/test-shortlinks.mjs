import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHandler } from '../api/shortlinks.js';

async function request(method, query = {}, body, fetchImpl) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  await createHandler(fetchImpl)({ method, url: '/api/shortlinks', query, body }, res);
  return res;
}
const destination = 'https://example.com/path?a=1&b=a%2Bb#section';
let submitted;
const provider = async (_url, options) => {
  submitted = options.body.get('url');
  return { ok: true, json: async () => ({ shorturl: 'https://is.gd/Abc123' }) };
};
let response = await request('POST', {}, { url: destination }, provider);
assert.equal(response.statusCode, 201);
assert.equal(submitted, destination);
const created = JSON.parse(response.body);
assert.equal(created.shortUrl, 'https://taithai.app/S/g-Abc123/');
// Resolution uses the code alone, with no cookies or browser storage.
response = await request('GET', { code: created.code });
assert.equal(response.statusCode, 302);
assert.equal(response.headers.Location, 'https://is.gd/Abc123');
response = await request('GET', { code: 'aB12' });
assert.equal(response.headers.Location, '/S/?c=aB12');
for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com', 'invalid']) {
  assert.equal((await request('POST', {}, { url }, provider)).statusCode, 400);
}
assert.equal((await request('POST', {}, '{')).statusCode, 400);
response = await request('POST', {}, { url: destination }, async () => ({ ok: false, json: async () => ({ errorcode: 3 }) }));
assert.equal(response.statusCode, 429);
assert.equal(response.headers['Retry-After'], '60');
assert.equal((await request('POST', {}, { url: destination }, async () => { throw new Error('timeout'); })).statusCode, 503);
assert.equal((await request('GET', { code: '../bad' })).statusCode, 404);
assert.equal((await request('POST', {}, { url: destination }, async () => ({ ok: true, json: async () => ({ shorturl: 'https://evil.example/token' }) }))).statusCode, 502);

const client = await readFile(new URL('../shortlinks.js', import.meta.url), 'utf8');
function browser(search, store, storageFails = false) {
  let redirected;
  const elements = Object.fromEntries(['longUrl', 'createBtn', 'result'].map(id => [id, { style: {}, addEventListener() {} }]));
  const context = {
    URL, URLSearchParams,
    location: { pathname: '/S/', search, replace(url) { redirected = url; } },
    localStorage: { getItem() { if (storageFails) throw new Error('disabled'); return store; } },
    document: { getElementById(id) { return elements[id]; } }
  };
  vm.runInNewContext(client, context);
  return { redirected, message: elements.result.textContent };
}
assert.equal(browser('?c=aB12', JSON.stringify({ aB12: { url: destination } })).redirected, destination);
assert.match(browser('?c=aB12', '{}').message, /ลิงก์เก่า/);
assert.equal(browser('?c=aB12', '{}').redirected, undefined);
assert.match(browser('?c=aB12', '', true).message, /ลิงก์เก่า/);
assert.equal(browser('?c=g-Abc123', '{}').redirected, '/api/shortlinks?code=g-Abc123');
console.log('Shortlink regression tests passed');
