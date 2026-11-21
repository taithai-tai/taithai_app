import test from 'node:test';
import assert from 'node:assert/strict';
import { initSiteMotion } from '../assets/site-motion.js';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, detail = {}) {
    const event = { type, target: this, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...detail };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  count(type) { return this.listeners.get(type)?.size || 0; }
}

// A small DOM fixture supports real selector relationships and layout eligibility;
// effects are exercised through browser events rather than internal helpers.
function compound(el, selector) {
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  for (const match of selector.matchAll(/([.#])([\w-]+)|\[([^=\]]+)(?:="([^"]*)")?\]/g)) {
    if (match[1] === '.' && !el.classList.contains(match[2])) return false;
    if (match[1] === '#' && el.id !== match[2]) return false;
    if (match[3] && (!el.hasAttribute(match[3]) || match[4] !== undefined && el.getAttribute(match[3]) !== match[4])) return false;
  }
  return true;
}
function matches(el, selector) {
  return selector.split(',').some(part => {
    const chain = part.trim().split(/\s+/); let node = el;
    if (!compound(node, chain.pop())) return false;
    while (chain.length) {
      const ancestor = chain.pop(); node = node.parentElement;
      while (node && !compound(node, ancestor)) node = node.parentElement;
      if (!node) return false;
    }
    return true;
  });
}
class Element extends Events {
  constructor(tag, doc) {
    super(); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.classes = new Set(); this.disabled = false; this.layout = { display: 'block', visibility: 'visible', position: 'static' };
    this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)), contains: name => this.classes.has(name) };
    const properties = new Map(); this.style = { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key), getPropertyValue: key => properties.get(key) || '' };
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get open() { return this.hasAttribute('open'); }
  set open(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); }
  get isConnected() { return this === this.doc.documentElement || Boolean(this.parentElement?.isConnected); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  hasAttribute(key) { return this.attributes.has(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getClientRects() {
    for (let node = this; node; node = node.parentElement) {
      if (node.hidden || node.layout.display === 'none' || node.tagName === 'DIALOG' && !node.open) return [];
    }
    return this.isConnected ? [this.getBoundingClientRect()] : [];
  }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 120, height: 44, right: 120, bottom: 44 }; }
}
function fixture({ reduced = false, intersection = false } = {}) {
  const doc = new Events(); doc.createElement = tag => new Element(tag, doc); doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body'); doc.body.className = 'site-page'; doc.documentElement.append(doc.body);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector); doc.querySelector = selector => doc.querySelectorAll(selector)[0] || null;
  const win = new Events(); const media = new Events(); media.matches = reduced; win.matchMedia = () => media; win.getComputedStyle = node => node.layout;
  let now = 0, next = 0; const timers = new Map();
  win.setTimeout = (fn, delay = 0) => { timers.set(++next, { fn, at: now + Number(delay) }); return next; }; win.clearTimeout = id => timers.delete(id);
  win.requestAnimationFrame = fn => win.setTimeout(fn, 16); win.cancelAnimationFrame = win.clearTimeout;
  const mutations = [], intersections = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.connected = false; mutations.push(this); }
    observe(node, options) { this.targets.add(node); this.options = options; this.connected = true; }
    disconnect() { this.connected = false; this.targets.clear(); }
    fire(records) { if (this.connected) this.callback(records); }
  }
  win.MutationObserver = Observer;
  if (intersection) win.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.connected = true; intersections.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); this.connected = false; }
    fire(nodes) { if (this.connected) this.callback(nodes.map(target => ({ target, isIntersecting: true }))); }
  };
  function add(tag = 'section', classes = '', parent = doc.body) { const node = doc.createElement(tag); node.className = classes; parent.append(node); return node; }
  function mutate(records) { for (const observer of mutations) if (observer.targets.has(doc.body)) observer.fire(records); }
  function tick(ms = 2000) {
    const end = now + ms;
    for (let iterations = 0; ; iterations++) {
      const item = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) break;
      assert.ok(iterations < 1000, 'motion timers settle'); timers.delete(item[0]); now = item[1].at; item[1].fn();
    }
    now = end;
  }
  function boot() { return initSiteMotion({ win, doc }); }
  function pointer(node, extras = {}) { return doc.fire('pointerdown', { target: node, button: 0, isPrimary: true, clientX: 20, clientY: 20, ...extras }); }
  return { doc, win, media, add, mutate, tick, boot, pointer, timers, mutations, intersections };
}
const has = (node, name) => node.classList.contains(name);
const ripple = node => node.querySelector('.tt-motion-ripple');

test('motion never reveals hidden, owner-only, inert, or disconnected content', () => {
  const f = fixture(); const shown = f.add('section', 'panel existing-app-class');
  const hidden = f.add('section', 'panel'); hidden.hidden = true;
  const owner = f.add('section', 'panel'); owner.setAttribute('data-owner-only', '');
  const ownerButton = f.add('button', '', owner);
  const nested = f.add('section'); nested.hidden = true; const child = f.add('section', 'panel', nested);
  const inert = f.add('section', 'panel'); inert.setAttribute('inert', '');
  const gone = f.add('section', 'panel'); gone.remove();
  const controller = f.boot();
  assert.ok(has(shown, 'tt-motion-enter'));
  for (const node of [hidden, owner, child, inert, gone]) assert.ok(!has(node, 'tt-motion-enter'));
  f.pointer(ownerButton); assert.equal(ripple(ownerButton), null);
  assert.equal(hidden.hidden, true); assert.equal(nested.hidden, true); assert.ok(has(shown, 'existing-app-class'));
  f.tick(); assert.ok(!has(shown, 'tt-motion-enter')); assert.ok(has(shown, 'existing-app-class'));
  controller.destroy();
});

test('press feedback preserves browser links, modifiers, keyboard defaults and form submission', () => {
  const f = fixture(); const controller = f.boot(); const form = f.add('form'); const submit = f.add('button', '', form); submit.setAttribute('type', 'submit');
  let submitted = 0; form.addEventListener('submit', () => submitted++);
  for (const attributes of [{ href: '/settings/' }, { href: '#apps' }, { href: '/export', download: '' }, { href: 'https://example.com', target: '_blank' }]) {
    const link = f.add('a'); for (const [key, value] of Object.entries(attributes)) link.setAttribute(key, value);
    const event = f.pointer(link, { ctrlKey: true, metaKey: true });
    assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false);
    const click = f.doc.fire('click', { target: link }); assert.equal(click.defaultPrevented, false);
    assert.ok(ripple(link));
  }
  const key = f.doc.fire('keydown', { target: submit, key: 'Enter', repeat: false });
  assert.equal(key.defaultPrevented, false); assert.equal(key.stopped, false);
  assert.equal(form.fire('submit').defaultPrevented, false); assert.equal(submitted, 1);
  assert.equal(f.doc.count('click'), 0); assert.equal(f.doc.count('submit'), 0);
  controller.destroy(); assert.equal(ripple(submit), null);
});

test('disabled and non-primary input never receives press decoration', () => {
  const f = fixture(); const controller = f.boot(); const button = f.add('button');
  button.disabled = true; f.pointer(button); assert.equal(ripple(button), null);
  button.disabled = false; button.setAttribute('aria-disabled', 'true'); f.pointer(button); assert.equal(ripple(button), null);
  button.removeAttribute('aria-disabled'); f.pointer(button, { button: 2 }); f.pointer(button, { isPrimary: false }); assert.equal(ripple(button), null);
  const link = f.add('a'); link.setAttribute('href', '/'); f.doc.fire('keydown', { target: link, key: ' ', repeat: false }); assert.equal(ripple(link), null);
  f.doc.fire('keydown', { target: button, key: 'Enter', repeat: true }); assert.equal(ripple(button), null);
  controller.destroy();
});

test('capsule navigation preserves tooltip children and receives press feedback without a ripple child', () => {
  const f = fixture(); const controller = f.boot();
  for (const railClass of ['home-rail', 'page-nav']) {
    const rail = f.add('nav', railClass); const link = f.add('a', '', rail); link.setAttribute('href', '/settings/');
    const icon = f.add('svg', 'nav-icon', link); const label = f.add('span', 'soft-nav-label', link);
    label.id = `${railClass}-settings`; label.textContent = 'Settings'; link.setAttribute('aria-labelledby', label.id);
    const event = f.pointer(icon);
    assert.equal(event.defaultPrevented, false); assert.ok(has(link, 'tt-motion-press')); assert.equal(ripple(link), null);
    assert.deepEqual(link.children, [icon, label]); assert.equal(link.getAttribute('aria-labelledby'), label.id); assert.equal(label.textContent, 'Settings');
    f.tick(); assert.ok(!has(link, 'tt-motion-press')); assert.deepEqual(link.children, [icon, label]);
  }
  controller.destroy();
});

test('site, Movie Memory and operating-system reduction cancel running effects immediately', () => {
  for (const source of ['site', 'movie', 'os']) {
    const f = fixture(); const panel = f.add('section', 'panel'); const button = f.add('button'); const controller = f.boot();
    f.pointer(button); assert.ok(ripple(button)); assert.ok(has(panel, 'tt-motion-enter'));
    if (source === 'site') { f.doc.documentElement.setAttribute('data-motion', 'reduce'); f.win.fire('taithai:preferences'); }
    if (source === 'movie') { f.doc.documentElement.setAttribute('data-mm-motion', 'reduced'); f.win.fire('mm:preferences'); }
    if (source === 'os') { f.media.matches = true; f.media.fire('change'); }
    assert.equal(ripple(button), null, source); assert.ok(!has(button, 'tt-motion-press'), source); assert.ok(!has(panel, 'tt-motion-enter'), source); assert.equal(f.timers.size, 0, source);
    f.pointer(button); assert.equal(ripple(button), null, source);
    let skipped = 0; f.win.fire('pagereveal', { viewTransition: { skipTransition() { skipped++; } } }); assert.equal(skipped, 1, source);
    controller.destroy();
  }
});

test('dialogs and tab panels animate only after becoming visible; removed effects are cleaned', () => {
  const f = fixture(); const dialog = f.add('dialog'); const tab = f.add('section'); tab.setAttribute('role', 'tabpanel'); tab.hidden = true;
  const hiddenOwner = f.add('section'); hiddenOwner.hidden = true; const secret = f.add('section', 'notice', hiddenOwner);
  const controller = f.boot(); assert.ok(!has(dialog, 'tt-motion-reveal')); assert.ok(!has(tab, 'tt-motion-reveal'));
  dialog.open = true; f.mutate([{ type: 'attributes', target: dialog, attributeName: 'open' }]); assert.ok(has(dialog, 'tt-motion-reveal'));
  tab.hidden = false; f.mutate([{ type: 'attributes', target: tab, attributeName: 'hidden' }]); assert.ok(has(tab, 'tt-motion-reveal'));
  f.mutate([{ type: 'attributes', target: secret, attributeName: 'aria-expanded' }]); assert.ok(!has(secret, 'tt-motion-reveal'));
  const button = f.add('button', '', dialog); f.pointer(button); assert.ok(ripple(button));
  dialog.open = false; f.mutate([{ type: 'attributes', target: dialog, attributeName: 'open' }]); assert.equal(ripple(button), null); assert.ok(!has(dialog, 'tt-motion-reveal'));
  tab.remove(); f.mutate([{ type: 'childList', addedNodes: [], removedNodes: [tab], target: f.doc.body }]); assert.ok(!has(tab, 'tt-motion-reveal'));
  const detachedDialog = f.add('dialog'); detachedDialog.open = true; detachedDialog.remove();
  f.mutate([{ type: 'childList', addedNodes: [detachedDialog], removedNodes: [], target: f.doc.body }]); assert.ok(!has(detachedDialog, 'tt-motion-reveal'));
  controller.destroy();
});

test('details feedback decorates visible content without changing native open state', () => {
  const f = fixture(); const details = f.add('details'); const summary = f.add('summary', '', details); const menu = f.add('nav', 'portal-menu-links', details); const controller = f.boot();
  const closed = f.doc.fire('toggle', { target: details }); assert.equal(closed.defaultPrevented, false); assert.ok(!has(menu, 'tt-motion-reveal'));
  details.open = true; const opened = f.doc.fire('toggle', { target: details });
  assert.equal(opened.defaultPrevented, false); assert.equal(details.open, true); assert.ok(has(menu, 'tt-motion-reveal')); assert.ok(!has(summary, 'tt-motion-reveal'));
  const timers = f.timers.size;
  f.mutate([{ type: 'attributes', target: menu, attributeName: 'class' }]);
  assert.equal(f.timers.size, timers, 'the effect does not restart itself through its class mutation');
  details.hidden = true; f.doc.fire('toggle', { target: details }); f.mutate([{ type: 'attributes', target: details, attributeName: 'hidden' }]); assert.ok(!has(menu, 'tt-motion-reveal'));
  controller.destroy();
});

test('native transitions survive normal pagehide but live reduction and destroy skip current handoffs', async () => {
  const f = fixture(); const controller = f.boot();
  let skipped = 0, finish;
  const transition = { finished: new Promise(resolve => { finish = resolve; }), skipTransition() { skipped++; } };
  f.win.fire('pageswap', { viewTransition: transition }); f.win.fire('pagehide', { persisted: true });
  assert.equal(skipped, 0, 'ordinary navigation keeps its browser-owned transition');
  f.doc.documentElement.setAttribute('data-motion', 'reduce'); f.win.fire('taithai:preferences'); assert.equal(skipped, 1, 'a live preference change cancels the handoff');
  f.win.fire('taithai:preferences'); assert.equal(skipped, 1, 'a cancelled handoff is released');
  finish(); await Promise.resolve();
  f.doc.documentElement.removeAttribute('data-motion'); f.win.fire('pageshow', { persisted: true });
  let completedSkips = 0;
  f.win.fire('pagereveal', { viewTransition: { finished: Promise.resolve(), skipTransition() { completedSkips++; } } });
  await Promise.resolve();
  let activeSkips = 0;
  f.win.fire('pagereveal', { viewTransition: { finished: new Promise(() => {}), skipTransition() { activeSkips++; } } });
  controller.destroy(); assert.equal(completedSkips, 0, 'finished transitions are released'); assert.equal(activeSkips, 1);
});

test('duplicate boot, bfcache restore and destroy retain one handler and clean all effects', () => {
  const f = fixture({ intersection: true }); const panel = f.add('section', 'panel'); const button = f.add('button'); const controller = f.boot();
  assert.equal(f.boot(), controller); assert.equal(f.doc.count('pointerdown'), 1); assert.equal(f.doc.count('keydown'), 1);
  f.intersections[0].fire([panel]); assert.ok(has(panel, 'tt-motion-enter')); f.pointer(button);
  f.win.fire('pagehide', { persisted: true }); assert.equal(f.timers.size, 0); assert.equal(ripple(button), null); assert.ok(!has(panel, 'tt-motion-enter'));
  assert.ok(f.mutations.filter(observer => observer.options?.subtree).every(observer => !observer.connected));
  f.pointer(button); assert.equal(ripple(button), null);
  f.win.fire('pageshow', { persisted: true }); assert.equal(f.doc.count('pointerdown'), 1); assert.ok(!has(panel, 'tt-motion-enter'), 'restored content does not replay');
  const pending = f.add('section', 'panel'); f.mutate([{ type: 'childList', target: f.doc.body, addedNodes: [pending], removedNodes: [] }]);
  f.intersections.at(-1).fire([pending]); assert.ok(has(pending, 'tt-motion-enter')); f.pointer(button); assert.equal(button.querySelectorAll('.tt-motion-ripple').length, 1);
  controller.destroy(); controller.destroy();
  assert.equal(f.timers.size, 0); assert.equal(ripple(button), null); assert.equal(f.doc.count('pointerdown'), 0); assert.equal(f.win.count('pageshow'), 0); assert.equal(f.media.count('change'), 0);
  assert.ok(f.mutations.every(observer => !observer.connected));
  const next = f.boot(); assert.notEqual(next, controller); assert.equal(f.doc.count('pointerdown'), 1); next.destroy();
});
