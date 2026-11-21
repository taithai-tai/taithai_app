import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractDegreePdfText } from '../assets/site-degree-pdf.js';

// A real, self-contained PDF with accurate byte offsets, not a mocked PDF.js API.
function transcriptPdf(lines) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const stream = 'BT /F1 12 Tf 50 740 Td ' + lines.map((line, index) => (index ? '0 -20 Td ' : '') + '(' + line.replace(/[\\()]/g, '\\$&') + ') Tj').join('\n') + ' ET';
  objects.push('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream');
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(source));
    source += (index + 1) + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(source);
  source += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  source += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([source], {type:'application/pdf'});
}

test('vendored main and matching worker parse real transcript text without a CDN', async () => {
  const text = await extractDegreePdfText(transcriptPdf(['BU TRANSCRIPT', 'MK101 Marketing A 3 credits', 'EN102 English B 3 credits']));
  assert.match(text, /BU TRANSCRIPT/);
  assert.match(text, /MK101 Marketing A 3 credits/);
  assert.match(text, /EN102 English B 3 credits/);
});

test('invalid and text-free PDFs fail honestly, and another upload still parses', async () => {
  await assert.rejects(extractDegreePdfText(new Blob(['not a PDF'])));
  await assert.rejects(extractDegreePdfText(transcriptPdf([])), /ไม่มีข้อความที่อ่านได้/);
  assert.match(await extractDegreePdfText(transcriptPdf(['CS101 Computer Science'])), /CS101/);
});

test('vendored PDF assets and licenses match the recorded verified package provenance', async () => {
  const base = new URL('../assets/vendor/pdfjs/6.5.438/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
  assert.equal(provenance.name, 'pdfjs-dist');
  assert.equal(provenance.version, '6.5.438');
  assert.equal(provenance.license, 'Apache-2.0');
  assert.ok(provenance.files['pdf.min.mjs'] && provenance.files['pdf.worker.min.mjs'] && provenance.files.LICENSE);
  for (const [file, hash] of Object.entries(provenance.files)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, base))).digest('hex'), hash, file);
  }
});
