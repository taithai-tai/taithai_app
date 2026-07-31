import { analyzeTicketImage } from '../ticket-analyzer.js';

function errorStatus(code) {
  if (code === 'INVALID_REQUEST' || code === 'INVALID_TICKET_IMAGE') return 400;
  if (code === 'TICKET_IMAGE_TOO_LARGE') return 413;
  if (code === 'TICKET_ANALYZER_NOT_CONFIGURED' || code === 'TICKET_ANALYZER_AUTH_FAILED') return 503;
  if (code === 'TICKET_ANALYZER_BUSY') return 429;
  if (code === 'TICKET_ANALYSIS_TIMEOUT') return 504;
  return 502;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const result = await analyzeTicketImage({
      image: body?.image,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || undefined
    });
    response.status(200).json({ result });
  } catch (error) {
    const code = error instanceof SyntaxError
      ? 'INVALID_REQUEST'
      : String(error?.message || 'TICKET_ANALYSIS_UNAVAILABLE');
    response.status(errorStatus(code)).json({ error: code });
  }
}
