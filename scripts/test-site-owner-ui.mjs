import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initOwnerUI } from '../assets/site-owner-ui.js';
import { createRequire } from 'node:module';
// Vercel routing-utils sourceToRegex uses these strict path-to-regexp options.
// Next already includes this compiler, so the routing regression adds no dependency.
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp');
const routePattern = source => pathToRegexp(source,[],{strict:true,sensitive:true,delimiter:'/'});

const owner = { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(loadAuth) {
  const win = new EventTarget();
  const links = [{ hidden: false }, { hidden: false }];
  const doc = { body: { dataset: {} }, querySelector: () => links[0], querySelectorAll: () => links };
  const subscriptions = [];
  const auth = { subscribeAuth(fn) { const entry = { fn, active: true }; subscriptions.push(entry); return () => { entry.active = false; }; } };
  const controller = initOwnerUI({ win, doc, loadAuth: loadAuth || (async () => auth) });
  return { win, doc, links, controller, subscriptions, notify(user) { subscriptions.filter(entry => entry.active).forEach(entry => entry.fn(user)); } };
}

test('owner controls stay hidden before authentication restoration finishes', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const app = fixture(() => pending);
  assert.ok(app.links.every(link => link.hidden));
  finish({ subscribeAuth(fn) { fn(null); return () => {}; } }); await flush();
  assert.ok(app.links.every(link => link.hidden)); app.controller.destroy();
});

test('only the verified exact owner identity reveals owner controls', async () => {
  const app = fixture(); await flush();
  for (const user of [null, { ...owner, emailVerified: false }, { ...owner, email: 'visitor@example.com', displayName: 'taithai5002@gmail.com' }, { ...owner, email: 'taithai5002+alias@gmail.com' }, { uid: owner.uid, displayName: owner.email }]) {
    app.notify(user); assert.ok(app.links.every(link => link.hidden), JSON.stringify(user));
  }
  app.notify(owner); assert.ok(app.links.every(link => !link.hidden)); app.controller.destroy();
});

test('sign-out and switching away from the owner immediately hide every owner control', async () => {
  const app = fixture(); await flush(); app.notify(owner);
  assert.ok(app.links.every(link => !link.hidden));
  app.notify({ ...owner, email: 'other@example.com' }); assert.ok(app.links.every(link => link.hidden));
  app.notify(owner); app.notify(null); assert.ok(app.links.every(link => link.hidden)); app.controller.destroy();
});

test('failed auth loading and late callbacks after destruction cannot reveal owner navigation', async () => {
  const failed = fixture(async () => { throw Error('offline'); }); await flush();
  assert.ok(failed.links.every(link => link.hidden)); failed.controller.destroy();
  const app = fixture(); await flush(); const callback = app.subscriptions[0].fn;
  app.notify(owner); app.controller.destroy(); callback(owner);
  assert.ok(app.links.every(link => link.hidden));
});

test('cached pages hide owner controls before leaving and recheck auth when restored', async () => {
  const app = fixture(); await flush(); app.notify(owner); const oldCallback = app.subscriptions[0].fn;
  app.win.dispatchEvent(new Event('pagehide')); assert.ok(app.links.every(link => link.hidden));
  oldCallback(owner); assert.ok(app.links.every(link => link.hidden));
  const restore = new Event('pageshow'); restore.persisted = true; app.win.dispatchEvent(restore);
  assert.ok(app.links.every(link => link.hidden)); await flush();
  app.notify({ ...owner, email: 'other@example.com' }); assert.ok(app.links.every(link => link.hidden));
  app.notify(owner); assert.ok(app.links.every(link => !link.hidden)); app.controller.destroy();
});

test('all public admin links are hidden in the HTML before JavaScript runs and have an owner guard', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)); let count = 0;
  async function scan(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'public', 'out', 'scripts', 'docs'].includes(entry.name)) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { await scan(file); continue; }
      if (!entry.name.endsWith('.html')) continue;
      const html = await readFile(file, 'utf8');
      for (const match of html.matchAll(/<a\b[^>]*href=["']\/admin(?:\/|#|\?|["'])[^>]*>/g)) {
        count++; assert.match(match[0], /\b(?:data-owner-only|data-dashboard-access)\b/, file); assert.match(match[0], /\bhidden\b/, file);
        assert.match(html, /<script\b[^>]*type="module"[^>]*src="\/assets\/site-owner-ui\.js"/, file);
      }
    }
  }
  await scan(root); assert.ok(count >= 10);
});


test('canonical admin links wait for server grants and redirects preserve service subpaths', async () => {
  const html = await readFile(new URL('../account/index.html',import.meta.url),'utf8');
  const card = html.match(/<section class="panel admin-access-shortcut"[^>]*>.*?<\/section>/s)?.[0];
  assert.ok(card);assert.match(card,/<section[^>]*data-admin-access[^>]*hidden/);assert.match(card,/href="\/mail\/"/);assert.match(html,/src="\/assets\/site-owner-ui\.js"/);assert.match(html,/src="\/assets\/site-access-ui\.js"/);
  const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(config.headers.find(item=>item.source==='/account/').headers.some(item=>item.key==='Content-Security-Policy'&&item.value.includes('https://taithai-app.netlify.app')));
  for(const service of ['admin','mail']) {
    assert.ok(config.redirects.some(item=>item.source===`/${service}/`&&item.destination===`https://taithai-app.netlify.app/${service}/`&&item.permanent===false));
    assert.ok(config.redirects.some(item=>item.source===`/${service}/:path*/`&&item.destination===`https://taithai-app.netlify.app/${service}/:path*/`&&item.permanent===false));
  }
});


test('strict Vercel route matching redirects canonical service URLs instead of serving main files or 404s',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.trailingSlash,true);
  const redirect=path=>{
    for(const rule of config.redirects){const match=routePattern(rule.source).exec(path);if(match)return {status:rule.permanent?308:307,location:rule.destination.replace(':path*',match[1]||'')};}
    return null;
  };
  for(const service of ['mail','admin']) {
    for(const suffix of ['', '/', '/inbox/', '/nested/item/', '/encoded%2Fpart/', '/asset.txt']) {
      const path=`/${service}${suffix}`;
      assert.deepEqual(redirect(path),{status:307,location:`https://taithai-app.netlify.app/${service}${suffix||'/'}`},path);
    }
  }
  for(const path of ['/mailbox/','/administrator/','/account/'])assert.equal(redirect(path),null,path);
  const accountHeaders=config.headers.filter(rule=>routePattern(rule.source).test('/account/')).flatMap(rule=>rule.headers);
  assert.equal(accountHeaders.filter(header=>header.key==='Content-Security-Policy').length,1);
  assert.match(accountHeaders.find(header=>header.key==='Content-Security-Policy').value,/connect-src [^;]*https:\/\/taithai-app\.netlify\.app(?:;| )/);
});
