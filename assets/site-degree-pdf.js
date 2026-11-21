/* Local text extraction only. The PDF and its contents never leave the browser. */
const vendor = new URL('./vendor/pdfjs/6.5.438/', import.meta.url);
let library;

async function loadPdfJs() {
  library ||= import(new URL('pdf.min.mjs', vendor).href).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendor).href;
    return pdfjs;
  }).catch(error => { library = null; throw error; });
  return library;
}

export async function extractDegreePdfText(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('กรุณาเลือกไฟล์ PDF');
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    cMapUrl: new URL('cmaps/', vendor).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', vendor).href,
    useWasm: false
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.filter(item => typeof item.str === 'string').map(item => item.str).join(' '));
      page.cleanup();
    }
    const text = pages.join('\n');
    if (!text.trim()) throw new Error('PDF นี้ไม่มีข้อความที่อ่านได้ หากเป็นภาพสแกน กรุณาใช้ PDF ที่เลือกข้อความได้');
    return text;
  } finally {
    await task.destroy();
  }
}
