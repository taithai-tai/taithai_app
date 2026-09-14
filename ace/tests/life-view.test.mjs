import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../dist/server/index.js';

// These exercise mesh data, Worker delivery and the renderer lifecycle in a DOM/GL test double.
// They do not claim browser rendering, GPU shader compilation or mobile visual QA.
const mesh = fs.readFileSync(new URL('../site/assets/ace-human.bin', import.meta.url));
const source = fs.readFileSync(new URL('../site/assets/life-view.js', import.meta.url), 'utf8');
const vertexCount = mesh.readUInt32LE(4), indexCount = mesh.readUInt32LE(8), scale = mesh.readFloatLE(12);
assert.equal(mesh.toString('ascii', 0, 4), 'ACE3');
assert.ok(vertexCount > 3000 && vertexCount < 65536);
assert.ok(indexCount > 15000 && indexCount % 3 === 0);
assert.equal(mesh.length, 16 + vertexCount * 14 + indexCount * 2);
assert.ok(mesh.length < 800000, 'Keep the mesh below 800 KB');
const points = [];
const bounds = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
for (let i = 0; i < vertexCount; i++) {
  const offset = 16 + i * 14;
  const p = [0, 1, 2].map(axis => mesh.readInt16LE(offset + axis * 2) / 32767 * scale);
  points.push(p);
  p.forEach((v, axis) => { bounds[axis][0] = Math.min(v, bounds[axis][0]); bounds[axis][1] = Math.max(v, bounds[axis][1]); });
  const normal = [0, 1, 2].map(axis => mesh.readInt16LE(offset + 6 + axis * 2) / 32767);
  assert.ok(Math.abs(Math.hypot(...normal) - 1) < .001, 'Normalized surface normal');
  assert.ok(mesh.readInt16LE(offset + 12) >= 0, 'Nonnegative ambient occlusion');
}
assert.ok(bounds[0][0] < -1.1 && bounds[0][1] > 1.1, 'Both arms and hands present');
assert.ok(bounds[1][0] < -1.3 && bounds[1][1] > 1.3, 'Full head-to-feet height');
assert.ok(bounds[2][1] - bounds[2][0] > .3, 'Actual volumetric depth');
for (let i = 0; i < indexCount; i++) assert.ok(mesh.readUInt16LE(16 + vertexCount * 14 + i * 2) < vertexCount);
// Use the same documented orthographic bounds to check that all vertices fit at representative stage sizes.
for (const [width, height] of [[320, 350], [350, 350], [390, 380], [420, 430], [369, 420], [490, 557]]) {
  const halfHeight = Math.max(1.57, 1.28 * height / width), halfWidth = halfHeight * width / height;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    for (const [x, y, z] of points) {
      assert.ok(Math.abs((Math.cos(angle) * x + Math.sin(angle) * z) / halfWidth) < 1, 'Horizontal mesh clipping');
      assert.ok(Math.abs((y + .015) / halfHeight) < 1, 'Vertical mesh clipping');
    }
  }
}
for (const [asset, type] of [['ace-human.bin', 'application/octet-stream'], ['ace-human-poster.webp', 'image/webp'], ['life-view.js', 'text/javascript; charset=utf-8']]) {
  const response = await worker.fetch(new Request('https://ace.test/assets/' + asset), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), type);
  const actual = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(actual, fs.readFileSync(new URL('../site/assets/' + asset, import.meta.url)));
}

function fixture({ webgl = true, brokenFetch = false, malformedMesh = false, compile = true, osReduced = false, savedReduced = false } = {}) {
  const listeners = new Map(), elements = new Map(), raf = new Map();
  let sequence = 0, draws = 0, lastYaw = 0, effectObserver, intersectionObserver;
  function target(id) {
    const attrs = new Map();
    const item = {
      id, dataset: {}, textContent: '', disabled: false, attrs,
      addEventListener(name, callback) { listeners.set(id + ':' + name, callback); },
      setAttribute(name, value) { attrs.set(name, value); },
      toggleAttribute(name, enabled) { if (enabled) attrs.set(name, ''); else attrs.delete(name); },
      getBoundingClientRect() { return { width: 350, height: 350 }; }
    };
    elements.set(id, item);
    return item;
  }
  for (const id of ['human-stage', 'human-canvas', 'human-rotation-toggle', 'human-rotation-label', 'human-rotation-status', 'rotation-pause-icon', 'rotation-play-icon']) target(id);
  const gl = new Proxy({
    NO_ERROR: 0,
    getShaderParameter: () => compile,
    getProgramParameter: () => true,
    getAttribLocation: (_, name) => ['a_position', 'a_normal', 'a_occlusion'].indexOf(name),
    getUniformLocation: (_, name) => name,
    getError: () => 0,
    isContextLost: () => false,
    uniform1f: (name, value) => { if (name === 'u_yaw') lastYaw = value; },
    drawElements: (_, count) => { assert.equal(count, indexCount); draws++; }
  }, { get: (object, key) => key in object ? object[key] : typeof key === 'string' && key === key.toUpperCase() ? 1 : () => ({}) });
  elements.get('human-canvas').getContext = () => webgl ? gl : null;
  const root = target('root');
  root.dataset.reduceEffects = String(savedReduced);
  const document = Object.assign(target('document'), { documentElement: root, hidden: false, getElementById: id => elements.get(id) });
  const motion = Object.assign(target('motion'), { matches: osReduced });
  const window = Object.assign(target('window'), {
    devicePixelRatio: 2, matchMedia: () => motion,
    ResizeObserver: true, IntersectionObserver: true
  });
  const context = vm.createContext({
    document, window, AbortController, DataView, Uint16Array, Int16Array, setTimeout, clearTimeout,
    requestAnimationFrame: callback => { const id = ++sequence; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    MutationObserver: class { constructor(callback) { effectObserver = callback; } observe() {} },
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { constructor(callback) { intersectionObserver = callback; } observe() {} },
    fetch: async () => ({ ok: !brokenFetch, arrayBuffer: async () => malformedMesh ? new ArrayBuffer(10) : mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) })
  });
  vm.runInContext(source, context);
  return {
    elements, raf, root, document, motion,
    get draws() { return draws; }, get yaw() { return lastYaw; },
    async next(time) { const entries = [...raf]; raf.clear(); for (const [, callback] of entries) await callback(time); },
    event(id, name, event = {}) { listeners.get(id + ':' + name)?.(event); },
    effects() { effectObserver(); }, visibility(value) { intersectionObserver([{ isIntersecting: value }]); }
  };
}

const scene = fixture();
await scene.next(1);
assert.equal(scene.elements.get('human-stage').dataset.render, '3d');
assert.equal(scene.elements.get('human-rotation-toggle').disabled, false);
await scene.next(100); await scene.next(116);
const rotatingYaw = scene.yaw;
assert.ok(rotatingYaw > -.12, 'Yaw actually advances');
scene.event('human-rotation-toggle', 'click');
assert.equal(scene.raf.size, 0);
assert.equal(scene.yaw, rotatingYaw);
assert.equal(scene.elements.get('human-rotation-label').textContent, 'หมุนต่อ');
scene.event('human-rotation-toggle', 'click');
assert.equal(scene.raf.size, 1);
scene.root.dataset.reduceEffects = 'true'; scene.effects();
assert.equal(scene.raf.size, 0); assert.equal(scene.elements.get('human-rotation-toggle').disabled, true);
scene.root.dataset.reduceEffects = 'false'; scene.effects();
assert.equal(scene.raf.size, 1);
scene.visibility(false); assert.equal(scene.raf.size, 0);
scene.visibility(true); assert.equal(scene.raf.size, 1);
scene.document.hidden = true; scene.event('document', 'visibilitychange'); assert.equal(scene.raf.size, 0);
scene.document.hidden = false; scene.event('document', 'visibilitychange'); assert.equal(scene.raf.size, 1);
scene.event('human-canvas', 'webglcontextlost', { preventDefault() {} });
assert.equal(scene.raf.size, 0); assert.equal(scene.elements.get('human-stage').dataset.render, 'poster');
for (const options of [{ webgl: false }, { brokenFetch: true }, { malformedMesh: true }, { compile: false }]) {
  const broken = fixture(options); await broken.next(1);
  assert.equal(broken.elements.get('human-stage').dataset.render, 'poster');
  assert.equal(broken.elements.get('human-rotation-toggle').disabled, true);
  assert.equal(broken.raf.size, 0);
}
for (const options of [{ osReduced: true }, { savedReduced: true }]) {
  const still = fixture(options); await still.next(1);
  assert.equal(still.elements.get('human-stage').dataset.render, '3d');
  assert.equal(still.raf.size, 0); assert.equal(still.draws, 2);
}
console.log(`Human mesh: ${vertexCount} vertices, ${indexCount / 3} triangles, ${mesh.length} bytes; full-rotation projection fits 6 stage sizes`);
console.log('Renderer lifecycle test doubles: rotate, pause/resume, reduced effects, visibility, missing WebGL, failed fetch, corrupt mesh, shader failure and context loss passed');
