import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = fs.readFileSync(path.join(root, 'QR Code Reader/vendor/jsQR.js'), 'utf8');
const decoder = fs.readFileSync(path.join(root, 'QR Code Reader/qr-decoder.js'), 'utf8');
const generatorSource = fs.readFileSync(path.join(root, 'QR Code Generator /vendor/qrcode.js'), 'utf8');
const generatorContext = vm.createContext({});
vm.runInContext(generatorSource, generatorContext);
const generator = generatorContext.qrcode;
generator.stringToBytes = generator.stringToBytesFuncs['UTF-8'];
function qrImage(text, inverted = false) {
  const qr = generator(0, 'M'); qr.addData(text); qr.make();
  const scale = 6, margin = 4, modules = qr.getModuleCount(), width = (modules + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / scale) - margin, col = Math.floor(x / scale) - margin;
    const dark = row >= 0 && col >= 0 && row < modules && col < modules && qr.isDark(row, col);
    const value = Boolean(dark) !== inverted ? 0 : 255;
    const offset = (y * width + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value; pixels[offset + 3] = 255;
  }
  return { width, height: width, pixels };
}
function runtime(native, { noFallback = false, readFails = false, stubFallback = false } = {}) {
  let source, sample;
  const canvas = { width: 0, height: 0, getContext() { return { drawImage(input) { source = input; }, getImageData() { if (readFails) throw new Error('tainted'); return { data: source.pixels }; } }; } };
  const context = vm.createContext({ Uint8ClampedArray, console, document: { createElement(tag) { assert.equal(tag, 'canvas'); sample = canvas; return canvas; } }, ...(native ? { BarcodeDetector: native } : {}) });
  if (!noFallback) vm.runInContext(vendor, context);
  if (stubFallback) context.jsQR = () => null;
  vm.runInContext(decoder, context);
  return { decode: context.TaithaiQrDecoder.decode, canvas: () => sample };
}
const text = 'https://taithai.app/';
assert.equal(await runtime().decode(qrImage(text)), text, 'Safari path uses the real vendored decoder');
assert.equal(await runtime().decode(qrImage(text, true)), text, 'Inverted QR is supported');
const unicode = '  แชตและเรื่องที่ชอบ  ';
assert.equal(await runtime().decode(qrImage(unicode)), unicode, 'Plain-text whitespace and Thai content are preserved');
assert.equal(await runtime(class { constructor() { throw new Error('Unsupported'); } }).decode(qrImage(text)), text);
let nativeCalls = 0;
const rejected = runtime(class { async detect() { nativeCalls++; throw new Error('Format unsupported'); } });
assert.equal(await rejected.decode(qrImage(text)), text);
assert.equal(await rejected.decode(qrImage(text)), text);
assert.equal(nativeCalls, 1, 'Failing native detection is not retried every camera frame');
assert.equal(await runtime(class { async detect() { return []; } }).decode(qrImage(text)), text, 'Native miss also tries fallback');
assert.equal(await runtime(class { async detect() { return [{ rawValue: ' native content ' }]; } }, { noFallback: true }).decode(qrImage(text)), ' native content ');
await assert.rejects(runtime(null, { noFallback: true }).decode(qrImage(text)), error => error.code === 'DECODER_UNAVAILABLE');
await assert.rejects(runtime(null, { readFails: true }).decode(qrImage(text)), error => error.code === 'IMAGE_READ_FAILED');
assert.equal(await runtime().decode({width:0,height:0}), '', 'Not-ready video frame is ignored');
const bounded = runtime(null, { stubFallback: true }); await bounded.decode({ width: 8000, height: 6000, pixels: new Uint8ClampedArray() });
assert.equal(bounded.canvas().width, 2048); assert.equal(bounded.canvas().height, 1536);
console.log('QR decoder: actual generated, inverted and Thai codes; native fallback/error handling; bounded canvas passed');

const html = fs.readFileSync(path.join(root, 'QR Code Reader/index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes('const video ='));
assert.ok(inline);
function uiRuntime() {
  const elements = new Map(), documentListeners = {}, windowListeners = {}, images = [];
  function element() { return { disabled:false, value:'', textContent:'', className:'', hidden:false, srcObject:null, readyState:2, classList:{add(){},remove(){}}, addEventListener(){}, async play(){} }; }
  const document = { hidden:false, getElementById(id){ if(!elements.has(id)) elements.set(id,element()); return elements.get(id); }, addEventListener(name,callback){documentListeners[name]=callback;} };
  const window = { TaithaiQrDecoder:{async decode(){return '';}}, addEventListener(name,callback){windowListeners[name]=callback;}, open(){throw new Error('Unexpected external navigation');} };
  const navigator = { mediaDevices:{async getUserMedia(){const error=new Error('no');error.name='NotAllowedError';throw error;}}, clipboard:{async writeText(){}} };
  class Image { constructor(){images.push(this);} set src(value){this.url=value;} }
  const context = vm.createContext({window,document,navigator,Image,URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},setInterval(){return 1;},clearInterval(){}});
  vm.runInContext(inline, context);
  return { context, elements, window, navigator, document, documentListeners, images };
}
const denied = uiRuntime(); await denied.context.startCamera();
assert.match(denied.elements.get('status').textContent, /สแกนจากรูป/); assert.equal(denied.elements.get('startBtn').disabled,false);
denied.context.setResult('https://taithai.app/'); assert.equal(denied.elements.get('openBtn').disabled,false);
denied.context.setResult('javascript:alert(1)'); assert.equal(denied.elements.get('openBtn').disabled,true);
const stale = uiRuntime(); let finish;
stale.window.TaithaiQrDecoder.decode = () => new Promise(resolve => {finish=resolve;});
const pending = stale.context.detectFromSource({}); stale.context.stopCamera(false); finish('stale');
assert.equal(await pending,null); assert.notEqual(stale.elements.get('resultText').textContent,'stale');
const failed = uiRuntime(); failed.window.TaithaiQrDecoder.decode = async()=>{const e=new Error('DECODER_UNAVAILABLE');e.code=e.message;throw e;};
await failed.context.scanFromFile({type:'image/png'}); await failed.images[0].onload();
assert.match(failed.elements.get('status').textContent,/รีเฟรช/); assert.doesNotMatch(failed.elements.get('status').textContent,/ไม่พบ QR/);
const hidden = uiRuntime(); let stopped=0; hidden.navigator.mediaDevices.getUserMedia=async()=>({getTracks(){return[{stop(){stopped++;}}];}});
await hidden.context.startCamera(); hidden.document.hidden=true; hidden.documentListeners.visibilitychange(); assert.equal(stopped,1);assert.equal(hidden.elements.get('stopBtn').disabled,true);
console.log('QR UI: camera denial recovery, safe open action, stale scan cancellation, exact decoder failure and camera cleanup passed');
