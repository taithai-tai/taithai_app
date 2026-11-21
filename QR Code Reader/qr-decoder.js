/* Native detector first; local jsQR 1.4.0 fallback for Safari and other browsers.
 * jsQR upstream: https://github.com/cozmo/jsQR — Apache-2.0, vendor/jsQR.LICENSE.
 * No image data leaves the browser. */
(function (global) {
  'use strict';
  let detector = null;
  try { if (typeof global.BarcodeDetector === 'function') detector = new global.BarcodeDetector({formats:['qr_code']}); } catch {}
  let sampleCanvas = null;
  function error(code) { const value = new Error(code); value.code = code; return value; }
  async function decode(source) {
    if (detector) {
      try {
        const codes = await detector.detect(source);
        const value = codes.find(code => typeof code.rawValue === 'string' && code.rawValue.length)?.rawValue;
        if (value) return value;
      } catch { detector = null; }
    }
    if (typeof global.jsQR !== 'function') throw error('DECODER_UNAVAILABLE');
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    if (!(sourceWidth > 0 && sourceHeight > 0)) return '';
    const scale = Math.min(1,2048/Math.max(sourceWidth,sourceHeight));
    const width = Math.max(1,Math.round(sourceWidth*scale));
    const height = Math.max(1,Math.round(sourceHeight*scale));
    if (!sampleCanvas) sampleCanvas = global.document.createElement('canvas');
    sampleCanvas.width = width; sampleCanvas.height = height;
    const context = sampleCanvas.getContext('2d',{willReadFrequently:true});
    if (!context) throw error('CANVAS_UNAVAILABLE');
    try {
      context.drawImage(source,0,0,width,height);
      const image = context.getImageData(0,0,width,height);
      const code = global.jsQR(image.data,width,height,{inversionAttempts:'attemptBoth'});
      return typeof code?.data === 'string' ? code.data : '';
    } catch (cause) {
      const failure = error('IMAGE_READ_FAILED'); failure.cause = cause; throw failure;
    }
  }
  global.TaithaiQrDecoder = Object.freeze({decode});
})(typeof window === 'undefined' ? globalThis : window);
