import { once } from 'node:events';
import { handleAI } from '../worker/index.template.js';

// Node adapter preserves the existing validation, upstream and NDJSON protocol.
// Environment variables are only read inside this server function.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify({ configured: Boolean(process.env.NINEARM_API_KEY), mode: 'LIVE_AI_MODE' }));
    return;
  }
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, POST');
    res.end(JSON.stringify({ ok: false, error: 'รองรับเฉพาะการอ่านสถานะและส่งคำขอ AI' })); return;
  }
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', cancel); res.once('close', cancel);
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    let raw;
    if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    else {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += Buffer.byteLength(chunk); if (bytes > 20_000) { res.statusCode = 413; res.end(JSON.stringify({ ok:false, error:'ข้อมูลยาวเกินขนาดที่รองรับ' })); return; } chunks.push(Buffer.from(chunk)); }
      raw = Buffer.concat(chunks).toString('utf8');
    }
    const host = headers.get('host') || 'localhost';
    const protocol = headers.get('x-forwarded-proto') === 'https' ? 'https' : (process.env.VERCEL ? 'https' : 'http');
    const request = new Request(`${protocol}://${host}/api/ai`, { method: 'POST', headers, body: raw, signal: controller.signal });
    const response = await handleAI(request, process.env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.flushHeaders?.();
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) await once(res, 'drain', { signal: controller.signal });
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    if (!res.destroyed) res.end();
  } catch {
    if (res.destroyed) return;
    if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ ok:false, error:'เชื่อมต่อ ACE AI ไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ โปรดลองใหม่' })); }
    else res.destroy();
  } finally { req.off('aborted', cancel); res.off('close', cancel); }
}
