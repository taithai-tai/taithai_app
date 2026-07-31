import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  analyzeTicketImage,
  DEFAULT_OPENROUTER_MODEL,
  MAX_TICKET_IMAGE_BYTES,
  normalizeTicketResult,
  OPENROUTER_FALLBACK_MODEL,
  parseTicketImageDataUrl
} from '../ticket-analyzer.js';

const tinyImage = 'data:image/png;base64,aGVsbG8=';
const ticketResolverSource = await readFile(
  new URL('../Movie Memory/ticket-movie-resolver.js', import.meta.url),
  'utf8'
);
const resolverSandbox = {};
resolverSandbox.globalThis = resolverSandbox;
runInNewContext(ticketResolverSource, resolverSandbox);
const ticketResolver = resolverSandbox.MovieMemoryTicketResolver;
assert.ok(ticketResolver);

assert.deepEqual(
  Array.from(ticketResolver.buildSearchQueries({
    title: 'DUNE: PART TW0 (IMAX EN)',
    originalTitle: ''
  })),
  ['DUNE: PART TW0 (IMAX EN)', 'dune part tw0', 'dune part two']
);
const duneMatch = ticketResolver.selectBestMovie([
  {
    id: 10,
    title: 'Dune: Part Two',
    original_title: 'Dune: Part Two',
    release_date: '2024-02-27',
    popularity: 120,
    _ticketSearchRank: 0
  },
  {
    id: 11,
    title: 'Dune',
    original_title: 'Dune',
    release_date: '2021-09-15',
    popularity: 100,
    _ticketSearchRank: 1
  }
], {
  title: 'DUNE: PART TW0 (IMAX EN)',
  originalTitle: '',
  watchDate: '2024-03-02'
});
assert.equal(duneMatch?.movie.id, 10);

const missionImpossibleQueries = Array.from(ticketResolver.buildSearchQueries({
  title: 'MI DEAD RECKONING P1',
  originalTitle: ''
}));
assert.ok(missionImpossibleQueries.includes('mi dead reckoning part one'));
assert.ok(missionImpossibleQueries.includes('dead reckoning part one'));
const missionImpossibleMatch = ticketResolver.selectBestMovie([
  {
    id: 15,
    title: 'มิชชั่น:อิมพอสซิเบิ้ล ล่าพิกัดมรณะ ตอนที่หนึ่ง',
    original_title: 'Mission: Impossible - Dead Reckoning Part One',
    release_date: '2023-07-08',
    popularity: 80,
    _ticketSearchRank: 0
  },
  {
    id: 16,
    title: 'Dead Reckoning',
    original_title: 'Dead Reckoning',
    release_date: '1947-01-23',
    popularity: 10,
    _ticketSearchRank: 1
  }
], {
  title: 'MI DEAD RECKONING P1',
  originalTitle: '',
  titleCandidates: ['Mission: Impossible - Dead Reckoning Part One'],
  watchDate: '2023-07-20'
});
assert.equal(missionImpossibleMatch?.movie.id, 15);

const alternativeTitleMatch = ticketResolver.selectBestMovie([
  {
    id: 20,
    title: 'Edge of Tomorrow',
    original_title: 'Edge of Tomorrow',
    release_date: '2014-05-27',
    popularity: 60,
    _ticketSearchRank: 0,
    _ticketAlternativeTitles: ['All You Need Is Kill']
  }
], {
  title: 'ALL YOU NEED IS KILL',
  originalTitle: '',
  watchDate: '2026-07-20'
});
assert.equal(alternativeTitleMatch?.movie.id, 20);

assert.equal(ticketResolver.selectBestMovie([
  {
    id: 30,
    title: 'Dune: Part One',
    release_date: '2021-09-15',
    popularity: 50,
    _ticketSearchRank: 0
  },
  {
    id: 31,
    title: 'Dune: Part Two',
    release_date: '2024-02-27',
    popularity: 50,
    _ticketSearchRank: 1
  }
], {
  title: 'DUNE PART',
  originalTitle: '',
  watchDate: '2026-07-20'
}), null);

const releaseAwareMatch = ticketResolver.selectBestMovie([
  {
    id: 40,
    title: 'The House',
    release_date: '2023-01-01',
    popularity: 20,
    _ticketSearchRank: 1
  },
  {
    id: 41,
    title: 'The House',
    release_date: '2027-01-01',
    popularity: 100,
    _ticketSearchRank: 0
  }
], {
  title: 'THE HOUSE',
  originalTitle: '',
  watchDate: '2026-07-20'
});
assert.equal(releaseAwareMatch?.movie.id, 40);
assert.equal(ticketResolver.selectBestMovie([
  { id: 50, title: 'Thor', release_date: '2011-04-21', popularity: 90, _ticketSearchRank: 0 }
], {
  title: 'TH',
  originalTitle: '',
  watchDate: '2026-07-20'
}), null);

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
    titleCandidates: [' Dune: Part Two ', 'Dune 2', 'Dune 2'],
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
    titleCandidates: ['Dune: Part Two', 'Dune 2'],
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
            titleCandidates: ['Dune: Part Two', 'Dune 2'],
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
assert.equal(
  capturedRequest.body.response_format.json_schema.schema.properties.titleCandidates.type,
  'array'
);
assert.ok(
  capturedRequest.body.response_format.json_schema.schema.required.includes('titleCandidates')
);
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

const [html, app, account, firebaseAuth, storageRules, api, server, envExample, readme, metadata, buildScript] = await Promise.all([
  readFile(new URL('../Movie Memory/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../Movie Memory/account.js', import.meta.url), 'utf8'),
  readFile(new URL('../firebase-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  readFile(new URL('../api/analyze-movie-ticket.js', import.meta.url), 'utf8'),
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../metadata.json', import.meta.url), 'utf8'),
  readFile(new URL('./build.mjs', import.meta.url), 'utf8')
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
assert.match(html, /ticket-movie-resolver\.js/);
assert.match(app, /MovieMemoryTicketResolver/);
assert.match(app, /alternative_titles/);
assert.match(app, /ยังยืนยันชื่อหนังจริงไม่ได้/);
assert.doesNotMatch(app, /applyTicketDetails\(ticket\);/);
assert.match(buildScript, /ticket-movie-resolver\.js/);
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
