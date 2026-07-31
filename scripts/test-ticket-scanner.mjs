import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeTicketImage,
  DEFAULT_OPENROUTER_MODEL,
  MAX_TICKET_IMAGE_BYTES,
  normalizeTicketResult,
  OPENROUTER_FALLBACK_MODEL,
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
      model: OPENROUTER_FALLBACK_MODEL,
      choices: [{
        message: {
          content: JSON.stringify({
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
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});

assert.equal(extracted.title, 'Dune: Part Two');
assert.equal(extracted.confidence, 0.97);
assert.equal(capturedRequest.url, 'https://openrouter.ai/api/v1/chat/completions');
assert.equal(capturedRequest.options.headers.Authorization, 'Bearer test-key');
assert.equal(capturedRequest.options.headers['HTTP-Referer'], 'https://taithai.app');
assert.equal(capturedRequest.options.headers['X-Title'], 'Movie Memory');
assert.deepEqual(capturedRequest.body.models, [
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_FALLBACK_MODEL
]);
assert.equal(capturedRequest.body.messages[0].content[0].type, 'text');
assert.equal(capturedRequest.body.messages[0].content[1].type, 'image_url');
assert.equal(
  capturedRequest.body.messages[0].content[1].image_url.url,
  tinyImage
);
assert.equal(capturedRequest.body.response_format.type, 'json_schema');
assert.equal(capturedRequest.body.response_format.json_schema.strict, true);
assert.equal(capturedRequest.body.response_format.json_schema.schema.type, 'object');
assert.equal(capturedRequest.body.response_format.json_schema.schema.additionalProperties, false);
assert.equal(capturedRequest.body.provider.require_parameters, true);

await assert.rejects(
  analyzeTicketImage({ image: tinyImage, apiKey: '' }),
  /TICKET_ANALYZER_NOT_CONFIGURED/
);
await assert.rejects(
  analyzeTicketImage({
    image: tinyImage,
    apiKey: 'invalid-key',
    fetchImpl: async () => new Response('{}', { status: 401 })
  }),
  /TICKET_ANALYZER_AUTH_FAILED/
);
await assert.rejects(
  analyzeTicketImage({
    image: tinyImage,
    apiKey: 'test-key',
    fetchImpl: async () => new Response('{}', { status: 429 })
  }),
  /TICKET_ANALYZER_BUSY/
);
await assert.rejects(
  analyzeTicketImage({
    image: tinyImage,
    apiKey: 'test-key',
    fetchImpl: async () => new Response('not-json', { status: 200 })
  }),
  /TICKET_ANALYSIS_INVALID_RESPONSE/
);
await assert.rejects(
  analyzeTicketImage({
    image: tinyImage,
    apiKey: 'test-key',
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  }),
  /TICKET_ANALYSIS_TIMEOUT/
);

const [html, app, account, firebaseAuth, storageRules, api, server, envExample, readme, metadata] = await Promise.all([
  readFile(new URL('../Movie Memory/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/account.js', import.meta.url), 'utf8'),
  readFile(new URL('../firebase-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  readFile(new URL('../api/analyze-movie-ticket.js', import.meta.url), 'utf8'),
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../metadata.json', import.meta.url), 'utf8')
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
assert.match(api, /process\.env\.OPENROUTER_API_KEY/);
assert.match(server, /process\.env\.OPENROUTER_API_KEY/);
assert.match(envExample, /OPENROUTER_MODEL=google\/gemma-4-26b-a4b-it:free/);
assert.match(readme, /openrouter\/free/);
assert.match(metadata, /SERVER_SIDE_OPENROUTER_API/);

for (const source of [app, api, server, envExample, readme, metadata]) {
  assert.doesNotMatch(source, /GEMINI|generativelanguage/i);
  assert.doesNotMatch(source, /sk-or-v1-[a-zA-Z0-9_-]+/);
}

console.log('Ticket scanner tests passed');
