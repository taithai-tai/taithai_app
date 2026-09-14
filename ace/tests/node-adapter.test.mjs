import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import handler from '../api/ace.js';

const originalFetch = globalThis.fetch;
const previousKey = process.env.NINEARM_API_KEY;
let upstreamBody;
let upstreamStatus = 200;
const server = http.createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const body = { mode:'writer', input:{ type:'appointment', recipient:'อาจารย์', points:'ขอปรึกษางาน', tone:'formal' } };
const post = (value = body, origin = base) => originalFetch(base, { method:'POST', headers:{ origin, 'content-type':'application/json', accept:'application/x-ndjson' }, body:JSON.stringify(value) });
try {
  delete process.env.NINEARM_API_KEY;
  assert.equal((await (await originalFetch(base)).json()).configured, false);
  assert.equal((await post()).status, 503);
  process.env.NINEARM_API_KEY = 'test-secret-not-a-real-key';
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://gateway.9arm.co/')) return originalFetch(url, options);
    upstreamBody = JSON.parse(options.body);
    if (upstreamStatus !== 200) return new Response('unavailable', { status:upstreamStatus });
    const chunk = JSON.stringify({ choices:[{delta:{content:'เรียนอาจารย์ ขอปรึกษางาน'},finish_reason:'stop'}] });
    return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, { headers:{'content-type':'text/event-stream'} });
  };
  assert.equal((await (await originalFetch(base)).json()).configured, true);
  const response = await post();
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.match(stream, /"type":"done"/);
  assert.match(stream, /เรียนอาจารย์ ขอปรึกษางาน/);
  assert.ok(!stream.includes(process.env.NINEARM_API_KEY));
  assert.match(upstreamBody.messages[1].content, /ขอปรึกษางาน/);
  assert.equal((await post(body, 'https://other.example')).status, 403);
  assert.equal((await post({mode:'planner',input:{tasks:[],availableMinutes:30}})).status, 400);
  assert.equal((await post({mode:'writer',input:{...body.input,points:'ก'.repeat(25000)}})).status, 413);
  upstreamStatus = 401;
  const failed = await (await post()).text();
  assert.match(failed, /"type":"error"/);
  assert.ok(!failed.includes('"type":"done"'));
  console.log('Node adapter: actual HTTP, status, missing secret, streaming, Thai input, origin, validation, size and honest upstream errors passed (mock upstream)');
} finally {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.NINEARM_API_KEY; else process.env.NINEARM_API_KEY = previousKey;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
