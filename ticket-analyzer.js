const DEFAULT_MODEL = 'gemini-2.5-flash';
export const MAX_TICKET_IMAGE_BYTES = 3 * 1024 * 1024;

const TICKET_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isMovieTicket: {
      type: 'BOOLEAN',
      description: 'True only when the image is a cinema ticket, booking confirmation, or cinema e-ticket.'
    },
    title: {
      type: 'STRING',
      description: 'The movie title exactly as shown on the ticket. Use an empty string when unreadable.'
    },
    originalTitle: {
      type: 'STRING',
      description: 'English or original-language movie title when clearly identifiable, otherwise an empty string.'
    },
    watchDate: {
      type: 'STRING',
      description: 'Screening date in YYYY-MM-DD using the Gregorian calendar, otherwise an empty string.'
    },
    cinema: {
      type: 'STRING',
      description: 'Cinema chain and branch shown on the ticket, otherwise an empty string.'
    },
    screen: {
      type: 'STRING',
      description: 'Auditorium, screen, theatre, or cinema number, otherwise an empty string.'
    },
    seat: {
      type: 'STRING',
      description: 'Seat row and number, otherwise an empty string.'
    },
    showtime: {
      type: 'STRING',
      description: 'Screening time in 24-hour HH:mm format, otherwise an empty string.'
    },
    confidence: {
      type: 'NUMBER',
      description: 'Overall extraction confidence between 0 and 1.'
    }
  },
  required: [
    'isMovieTicket',
    'title',
    'originalTitle',
    'watchDate',
    'cinema',
    'screen',
    'seat',
    'showtime',
    'confidence'
  ]
};

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanDate(value) {
  const date = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date;
}

function cleanTime(value) {
  const time = cleanText(value, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return '';
  return time;
}

export function parseTicketImageDataUrl(value) {
  if (typeof value !== 'string') throw new Error('INVALID_TICKET_IMAGE');
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) throw new Error('INVALID_TICKET_IMAGE');

  const base64 = match[2].replace(/\s+/g, '');
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (!base64 || estimatedBytes > MAX_TICKET_IMAGE_BYTES) throw new Error('TICKET_IMAGE_TOO_LARGE');

  return {
    mimeType: match[1].toLowerCase(),
    base64
  };
}

export function normalizeTicketResult(value) {
  const result = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    isMovieTicket: result.isMovieTicket === true,
    title: cleanText(result.title, 120),
    originalTitle: cleanText(result.originalTitle, 120),
    watchDate: cleanDate(result.watchDate),
    cinema: cleanText(result.cinema, 100),
    screen: cleanText(result.screen, 40),
    seat: cleanText(result.seat, 50),
    showtime: cleanTime(result.showtime),
    confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0))
  };
}

function responseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
}

function parseJsonResponse(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function analyzeTicketImage({
  image,
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch
}) {
  if (!apiKey) throw new Error('TICKET_ANALYZER_NOT_CONFIGURED');
  const { mimeType, base64 } = parseTicketImageDataUrl(image);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 26000);
  const prompt = [
    'Inspect this image as a movie-ticket data extraction task.',
    'Read Thai and English text. Never invent missing values.',
    'A booking confirmation or mobile cinema e-ticket counts as a movie ticket.',
    'For Thai Buddhist years, convert to the Gregorian year by subtracting 543.',
    'Return empty strings for fields that are not clearly readable.',
    'The cinema field should include both the cinema chain and branch when visible.',
    'Do not return booking codes, payment information, names, phone numbers, emails, QR contents, or other personal data.'
  ].join(' ');

  let upstream;
  try {
    upstream = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: TICKET_SCHEMA
          }
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('TICKET_ANALYSIS_TIMEOUT');
    throw new Error('TICKET_ANALYSIS_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) throw new Error('TICKET_ANALYZER_AUTH_FAILED');
    if (upstream.status === 429) throw new Error('TICKET_ANALYZER_BUSY');
    throw new Error('TICKET_ANALYSIS_UNAVAILABLE');
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    throw new Error('TICKET_ANALYSIS_INVALID_RESPONSE');
  }

  const text = responseText(payload);
  if (!text) throw new Error('TICKET_ANALYSIS_EMPTY');

  try {
    return normalizeTicketResult(parseJsonResponse(text));
  } catch {
    throw new Error('TICKET_ANALYSIS_INVALID_RESPONSE');
  }
}
