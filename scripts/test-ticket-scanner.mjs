import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeTicketImage,
  MAX_TICKET_IMAGE_BYTES,
  normalizeTicketResult,
  parseTicketImageDataUrl
} from '../ticket-analyzer.js';

const tinyImage = 'data:image/png;base64,aGVsbG8=';
assert.deepEqual(parseTicketImageDataUrl(tinyImage), {
  mimeType: 'image/png',
  base64: 'aGVsbG8='
});
assert.throws(() => parseTicketImageDataUrl('https://example.com/ticket.jpg'), /INVALID_TICKET_IMAGE/);
assert.throws(
  () => parseTicketImageDataUrl(`data:image/jpeg;base64,${'a'.repeat(Math.ceil(MAX_TICKET_IMAGE_BYTES * 4 / 3) + 8)}`),
  /TICKET_IMAGE_TOO_LARGE/
);

assert.deepEqual(
  normalizeTicketResult({
    isMovieTicket: true,
    title: '  Dune: Part Two  ',
    originalTitle: 'Dune: Part Two',
    watchDate: '2026-07-31',
    cinema: '  SF World Cinema  ',
    screen: 'Cinema 8',
    seat: 'G12',
    showtime: '19:30',
    confidence: 1.8
  }),
  {
    isMovieTicket: true,
    title: 'Dune: Part Two',
    originalTitle: 'Dune: Part Two',
    watchDate: '2026-07-31',
    cinema: 'SF World Cinema',
    screen: 'Cinema 8',
    seat: 'G12',
    showtime: '19:30',
    confidence: 1
  }
);
assert.equal(normalizeTicketResult({ watchDate: '2026-02-31', showtime: '25:00' }).watchDate, '');
assert.equal(normalizeTicketResult({ watchDate: '2026-02-28', showtime: '25:00' }).showtime, '');

let capturedRequest;
const extracted = await analyzeTicketImage({
  image: tinyImage,
  apiKey: 'test-key',
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              isMovieTicket: true,
              title: 'Dune: Part Two',
              originalTitle: 'Dune: Part Two',
              watchDate: '2026-07-31',
              cinema: 'SF World Cinema',
              screen: '8',
              seat: 'G12',
              showtime: '19:30',
              confidence: 0.97
            })
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});

assert.equal(extracted.title, 'Dune: Part Two');
assert.equal(extracted.confidence, 0.97);
assert.match(capturedRequest.url, /gemini-2\.5-flash:generateContent$/);
assert.equal(capturedRequest.options.headers['x-goog-api-key'], 'test-key');
assert.equal(capturedRequest.body.contents[0].parts[1].inlineData.mimeType, 'image/png');
assert.equal(capturedRequest.body.generationConfig.responseMimeType, 'application/json');

const [html, app, account, firebaseAuth, storageRules] = await Promise.all([
  readFile(new URL('../Movie Memory/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/account.js', import.meta.url), 'utf8'),
  readFile(new URL('../firebase-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../storage.rules', import.meta.url), 'utf8')
]);

for (const id of ['ticketAnalysisPanel', 'ticketAnalysisTitle', 'retryTicketAnalysisBtn', 'ticketFileInput']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
for (const functionName of ['analyzeAndApplyTicket', 'findTicketMovie', 'applyTicketDetails']) {
  assert.match(app, new RegExp(`function ${functionName}`));
}
assert.match(app, /const existingViewing = existing && requestedViewingId/);
assert.match(app, /เพิ่มการดูครั้งใหม่พร้อมรูปตั๋วแล้ว/);
assert.match(account, /imageFingerprint/);
assert.match(firebaseAuth, /uploadPrivateTicketImage/);
assert.match(storageRules, /movie-memory\/tickets/);

console.log('Ticket scanner tests passed');
