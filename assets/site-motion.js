/* Progressive motion for Taithai. Browser navigation, app state and focus stay
   with their existing owners; effects only decorate currently visible UI. */
const controllers = new WeakMap();
const ENTRY = [
  '.site-home .hero-copy', '.site-home .toolkit', '.site-home .stats-bar', '.site-home .app-card',
  '.site-page .page-intro', '.site-page .panel', '.site-page .help-card',
  '.site-page .access-page', '.site-page .soft-recovery', '.site-utility',
  '.tt-qr main.card', '.tt-shortlink main.card', '.tt-downloader main.card',
  '.tt-public .dropzone', '.tt-public .table-wrap', '.tt-private .step',
  '.tt-private .device', '.tt-planner .selector-box', '.tt-planner .semester-card',
  '.taithai-movie .hero', '.taithai-movie .toolbar', '.taithai-movie .page-header', '.taithai-movie .settings-panel', '.taithai-movie .dashboard-stat', '.taithai-movie .dashboard-panel',
  '.tt-chat #home', '.tt-chat .waiting-card', '.tt-chordly main', '.tt-chordly .streamHeroContent', '.tt-chordly .streamEmptyHistory', '.tt-ace .demo-card'
].join(',');
const REVEAL = 'dialog,[role="tabpanel"],.modal,.sheet,.screen,.attach-menu,.portal-menu-links,.app-search-empty,.notice,.empty-state,.site-utility__offline,[data-motion-reveal]';
const CONTROL = 'button,a[href],[role="button"],summary';

export function initSiteMotion({ win = window, doc = document } = {}) {
  if (controllers.has(doc)) return controllers.get(doc);
  const root = doc.documentElement;
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const nativeTransitions = new Set();
  const ripples = new Map();
  const seen = new WeakSet();
  const observed = new WeakSet();
  const visible = new WeakMap();
  let suspended = false, destroyed = false, observer, intersection;

  const reduced = () => Boolean(media?.matches || root.getAttribute('data-motion') === 'reduce' || root.getAttribute('data-mm-motion') === 'reduced');
  function rendered(el) {
    if (!el?.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && el.getClientRects().length > 0;
  }
  function permitted(el) {
    return !destroyed && !suspended && !reduced() && rendered(el) && !el.closest('[data-owner-only],[data-owner-app-settings]');
  }
  function stopClass(el, name) {
    const effects = active.get(el);
    if (!effects?.has(name)) return;
    win.clearTimeout(effects.get(name));
    el.classList.remove(name);
    effects.delete(name);
    if (!effects.size) { active.delete(el); el.style.removeProperty('--tt-enter-delay'); }
  }
  function decorate(el, name, duration, delay = 0) {
    if (!permitted(el)) return;
    stopClass(el, name);
    const effects = active.get(el) || new Map();
    active.set(el, effects);
    if (name === 'tt-motion-enter') el.style.setProperty('--tt-enter-delay', `${delay}ms`);
    el.classList.add(name);
    effects.set(name, win.setTimeout(() => stopClass(el, name), duration + delay + 80));
  }
  function removeRipple(host) {
    const effect = ripples.get(host);
    if (!effect) return;
    win.clearTimeout(effect.timer);
    effect.node.remove();
    if (effect.positioned) host.classList.remove('tt-motion-ripple-host');
    ripples.delete(host);
  }
  function clearEffects(scope) {
    for (const [el, effects] of active) {
      if (scope && el !== scope && !scope.contains(el)) continue;
      for (const name of [...effects.keys()]) stopClass(el, name);
    }
    for (const host of [...ripples.keys()]) {
      if (!scope || host === scope || scope.contains(host)) removeRipple(host);
    }
  }
  function enter(el, delay = 0) {
    if (seen.has(el) || !permitted(el)) return;
    // Parent panels carry their contents together rather than animating text twice.
    if (el.parentElement?.closest('.tt-motion-enter,.tt-motion-reveal')) return;
    seen.add(el);
    decorate(el, 'tt-motion-enter', 480, delay);
  }
  function register(el) {
    if (observed.has(el)) return;
    observed.add(el);
    if (intersection) intersection.observe(el);
    else enter(el);
  }
  function candidates(scope, selector) {
    const result = [];
    if (scope.matches?.(selector)) result.push(scope);
    if (scope.querySelectorAll) result.push(...scope.querySelectorAll(selector));
    return result;
  }
  function scan(scope = doc.body, newlyAdded = false) {
    if (!scope || destroyed || suspended) return;
    for (const el of candidates(scope, REVEAL)) {
      const shown = rendered(el);
      visible.set(el, shown);
      if (newlyAdded && shown && !el.parentElement?.closest(REVEAL)) decorate(el, 'tt-motion-reveal', 320);
    }
    for (const el of candidates(scope, ENTRY)) register(el);
  }
  function onMutations(records) {
    if (destroyed || suspended) return;
    const changed = new Set(), pendingEntries = new Set();
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) if (node.nodeType === 1 && !node.classList.contains('tt-motion-ripple')) scan(node, true);
        for (const node of record.removedNodes) if (node.nodeType === 1) clearEffects(node);
      } else {
        const el = record.target;
        if (record.attributeName === 'hidden' || record.attributeName === 'open') {
          if (!rendered(el)) clearEffects(el);
          if (!intersection) for (const child of candidates(el, ENTRY)) pendingEntries.add(child);
          for (const child of candidates(el, REVEAL)) changed.add(child);
        } else if (el.matches?.(REVEAL)) changed.add(el);
      }
    }
    for (const el of changed) {
      const shown = rendered(el), wasShown = visible.get(el);
      visible.set(el, shown);
      if (!shown) clearEffects(el);
      else if (wasShown === false && !el.parentElement?.closest('.tt-motion-enter,.tt-motion-reveal')) decorate(el, 'tt-motion-reveal', 320);
    }
    for (const el of pendingEntries) enter(el);
  }
  function press(el, point) {
    if (!el || el.disabled || el.closest('[aria-disabled="true"]') || !permitted(el)) return;
    // A full-card link gets press feedback without an overlay over its content.
    if (el.matches('.app-card,.toolkit-item,.help-card,.home-rail a,.page-nav a')) {
      decorate(el, 'tt-motion-press', 160);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    removeRipple(el);
    const positioned = win.getComputedStyle(el).position === 'static';
    if (positioned) el.classList.add('tt-motion-ripple-host');
    const ripple = doc.createElement('span');
    ripple.className = 'tt-motion-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const x = point ? Math.max(0, Math.min(rect.width, point.clientX - rect.left)) : rect.width / 2;
    const y = point ? Math.max(0, Math.min(rect.height, point.clientY - rect.top)) : rect.height / 2;
    ripple.style.setProperty('--tt-ripple-x', `${x}px`);
    ripple.style.setProperty('--tt-ripple-y', `${y}px`);
    ripple.style.setProperty('--tt-ripple-size', `${Math.hypot(rect.width, rect.height) * 2}px`);
    el.append(ripple);
    ripples.set(el, {node:ripple, positioned, timer:win.setTimeout(() => removeRipple(el), 640)});
    decorate(el, 'tt-motion-press', 160);
  }
  function pointer(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    press(event.target?.closest?.(CONTROL), event);
  }
  function keyboard(event) {
    if (event.repeat || !['Enter', ' '].includes(event.key)) return;
    const el = event.target?.closest?.(CONTROL);
    if (event.key === ' ' && el?.matches('a[href]')) return;
    press(el);
  }
  function details(event) {
    if (event.target?.matches('details') && event.target.open) {
      const panel = event.target.querySelector('.portal-menu-links') || [...event.target.children].find(el => !el.matches('summary'));
      if (panel) decorate(panel, 'tt-motion-reveal', 320);
    }
  }
  function skipNative() {
    for (const effect of nativeTransitions) effect.skipTransition();
    nativeTransitions.clear();
  }
  function preference() { if (reduced()) { clearEffects(); skipNative(); } }
  function transition(event) {
    const effect = event.viewTransition;
    if (!effect) return;
    if (reduced()) { effect.skipTransition(); return; }
    nativeTransitions.add(effect);
    effect.finished?.then(() => nativeTransitions.delete(effect), () => nativeTransitions.delete(effect));
  }
  function connect() {
    if (destroyed) return;
    if (win.IntersectionObserver) {
      intersection = new win.IntersectionObserver(entries => {
        let index = 0;
        for (const item of entries) if (item.isIntersecting && permitted(item.target)) {
          enter(item.target, Math.min(index++, 5) * 45);
          intersection.unobserve(item.target);
        }
      }, {threshold:0.08, rootMargin:'0px 0px -16px 0px'});
    }
    scan();
    if (win.MutationObserver) {
      observer = new win.MutationObserver(onMutations);
      observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','open','class','style','aria-selected','aria-expanded','aria-pressed']});
    }
  }
  function hide() {
    suspended = true;
    observer?.disconnect(); intersection?.disconnect();
    clearEffects();
  }
  function show(event) {
    if (!event.persisted || destroyed) return;
    suspended = false;
    observer?.disconnect(); intersection?.disconnect();
    observer = intersection = undefined;
    // Resume pending candidates without replaying effects on restored content.
    if (win.IntersectionObserver) {
      intersection = new win.IntersectionObserver(entries => {
        for (const item of entries) if (item.isIntersecting && permitted(item.target)) {
          enter(item.target); intersection.unobserve(item.target);
        }
      }, {threshold:0.08});
      for (const el of candidates(doc.body, ENTRY)) if (!seen.has(el)) intersection.observe(el);
    }
    scan();
    if (win.MutationObserver) {
      observer = new win.MutationObserver(onMutations);
      observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','open','class','style','aria-selected','aria-expanded','aria-pressed']});
    }
  }
  const listeners = [
    [doc,'pointerdown',pointer], [doc,'keydown',keyboard], [doc,'toggle',details,true],
    [win,'taithai:preferences',preference], [win,'mm:preferences',preference],
    [win,'pageswap',transition], [win,'pagereveal',transition], [win,'pagehide',hide], [win,'pageshow',show]
  ];
  for (const [target, name, fn, capture] of listeners) target.addEventListener(name, fn, capture || false);
  media?.addEventListener?.('change', preference);
  const rootObserver = win.MutationObserver ? new win.MutationObserver(preference) : null;
  rootObserver?.observe(root, {attributes:true, attributeFilter:['data-motion','data-mm-motion']});
  const controller = {
    refresh: () => scan(),
    destroy() {
      if (destroyed) return;
      hide(); skipNative(); destroyed = true;
      for (const [target, name, fn, capture] of listeners) target.removeEventListener(name, fn, capture || false);
      media?.removeEventListener?.('change', preference);
      rootObserver?.disconnect();
      controllers.delete(doc);
    }
  };
  controllers.set(doc, controller);
  connect();
  return controller;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initSiteMotion(), {once:true});
  else initSiteMotion();
}
