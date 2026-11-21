import { handleAccessSession, nodeWebRequest, sendWebResponse } from '../server-lib/site-app-gate.js';

export default async function handler(req, res) {
  try { await sendWebResponse(await handleAccessSession(nodeWebRequest(req)), req, res); }
  catch { res.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"error":"AUTH_UNAVAILABLE"}'); }
}
