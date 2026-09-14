import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../dist/server/index.js';

// Request/cache contract tests; not a claim about the user's actual browser cache.
const htmlResponse = await worker.fetch(new Request('https://ace.test/'), {});
const html = await htmlResponse.text();
const rendererUrl = html.match(/<script defer src="([^"]*life-view\.js[^\"]*)"/)?.[1];
assert.ok(rendererUrl && rendererUrl !== '/assets/life-view.js', 'Must bypass the prior one-hour cached renderer URL');
// Neither the original URL nor the previous avatar URL can satisfy the restored renderer URL.
const oldCache = new Map([
  ['/assets/life-view.js', 'fetch("/assets/ace-avatar.bin")'],
  ['/assets/life-view.js?v=peeps-avatar-r2', 'fetch("/assets/ace-avatar.bin")'],
]);
assert.equal(oldCache.has(rendererUrl), false);
const renderer = await worker.fetch(new Request('https://ace.test' + rendererUrl), {});
const code = await renderer.text();
assert.match(code, /fetch\('\/assets\/ace-human\.bin'/);
assert.doesNotMatch(code, /ace-avatar\.bin/);

for (const path of ['/', '/assets/life-view.js', '/assets/styles.css', '/assets/ace-human.bin', '/assets/ace-human-poster.webp']) {
  const url = 'https://ace.test' + path;
  const response = await worker.fetch(new Request(url), {});
  const bytes = Buffer.from(await response.arrayBuffer());
  const tag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
  assert.equal(response.headers.get('etag'), tag);
  assert.match(response.headers.get('cache-control'), /no-cache/);
  assert.doesNotMatch(response.headers.get('cache-control'), /max-age=3600/);
  for (const match of [tag, 'W/' + tag, '"different", ' + tag]) {
    const cached = await worker.fetch(new Request(url, { headers: { 'if-none-match': match } }), {});
    assert.equal(cached.status, 304);
    assert.equal((await cached.arrayBuffer()).byteLength, 0);
  }
  const changed = await worker.fetch(new Request(url, { headers: { 'if-none-match': '"old-content"' } }), {});
  assert.equal(changed.status, 200);
  assert.deepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
  const head = await worker.fetch(new Request(url, { method: 'HEAD' }), {});
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('etag'), tag);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
}
assert.deepEqual(Buffer.from(await (await worker.fetch(new Request('https://ace.test/assets/ace-human.bin'), {})).arrayBuffer()), fs.readFileSync(new URL('../site/assets/ace-human.bin', import.meta.url)));
console.log('Asset update regression: old renderer URLs bypassed; white human requested; content ETags, 304 revalidation, changed bytes and HEAD passed');
