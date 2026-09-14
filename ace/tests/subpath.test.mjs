import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildACE } from '../scripts/build.mjs';

const output = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-subpath-'));
try {
  await buildACE({ output, basePath: '/ACE', siteUrl: 'https://taithai.app/ACE' });
  const routes = ['', 'services', 'how-it-works', 'demo', 'pricing', 'about', 'contact', 'privacy', 'thank-you'];
  for (const route of routes) {
    const html = await fs.readFile(path.join(output, route, 'index.html'), 'utf8');
    assert.match(html, /This website is created for educational purposes only\./);
    assert.match(html, /เว็บไซต์นี้จัดทำขึ้นเพื่อวัตถุประสงค์ทางการศึกษาเท่านั้น/);
    for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]*)(?:[^\"]*)"/g)) {
      assert.ok(match[1].startsWith('/ACE/'), `${route}: ${match[1]} must stay inside ACE`);
      const relative = match[1].slice('/ACE/'.length);
      await fs.access(path.join(output, relative, relative.endsWith('/') || !relative ? 'index.html' : ''));
    }
  }
  for (const name of await fs.readdir(path.join(output, 'assets'))) {
    if (name.endsWith('.js')) new vm.Script(await fs.readFile(path.join(output, 'assets', name), 'utf8'), { filename: name });
  }
  const nav = await fs.readFile(path.join(output, 'assets/site.js'), 'utf8');
  assert.match(nav, /href="\/ACE\/contact\/\?package=/);
  assert.match(nav, /href="\/ACE\/contact\/\?service=/);
  assert.match(nav, /href="\/">กลับ Taithai Apps/);
  assert.match(await fs.readFile(path.join(output, 'assets/life-view.js'), 'utf8'), /fetch\('\/ACE\/assets\/ace-human.bin'/);
  assert.match(await fs.readFile(path.join(output, 'assets/ai-client.js'), 'utf8'), /fetch\("\/api\/ace\/"/);
  assert.match(await fs.readFile(path.join(output, 'sitemap.xml'), 'utf8'), /https:\/\/taithai.app\/ACE\/services\//);
  await assert.rejects(fs.access(path.join(output, 'worker')));
  await assert.rejects(fs.access(path.join(output, '.env.example')));
  console.log('Subpath: all 9 pages, local assets, query CTAs, renderer, API URL, syntax and server-file exclusion passed');
} finally { await fs.rm(output, { recursive: true, force: true }); }
