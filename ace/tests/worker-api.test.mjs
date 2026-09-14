import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const originalFetch = globalThis.fetch;
let captured = null;

try {
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: "คำตอบทดสอบจาก AI" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const env = {
    NINEARM_API_KEY: "test-secret-not-a-real-key",
    NINEARM_BASE_URL: "https://gateway.9arm.co/v1",
    NINEARM_MODEL: "qwen3.8-27b-fp8"
  };
  const request = new Request("https://ace.test/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ace.test", "cf-connecting-ip": "192.0.2.10" },
    body: JSON.stringify({ mode: "writer", input: { type: "appointment", recipient: "อาจารย์", points: "ขอนัดคุยเรื่องงาน", tone: "formal" } })
  });
  const response = await worker.fetch(request, env, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.content, "คำตอบทดสอบจาก AI");
  assert.equal(captured.url, "https://gateway.9arm.co/v1/chat/completions");
  assert.equal(captured.init.headers.authorization, "Bearer test-secret-not-a-real-key");
  const upstreamBody = JSON.parse(captured.init.body);
  assert.equal(upstreamBody.model, "qwen3.8-27b-fp8");
  assert.equal(upstreamBody.stream, true);
  assert.equal(upstreamBody.chat_template_kwargs.enable_thinking, false);
  assert.equal(body.provider, undefined);
  assert.equal(body.model, undefined);
  assert.equal(upstreamBody.messages[0].role, "system");
  assert.match(upstreamBody.messages[1].content, /อาจารย์/);

  captured = null;
  const crossOrigin = await worker.fetch(new Request("https://ace.test/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://other.test" },
    body: JSON.stringify({ mode: "summary", input: { source: "ข้อความ" } })
  }), env, {});
  assert.equal(crossOrigin.status, 403);
  assert.equal(captured, null, "cross-origin request must not reach the AI provider");

  const invalid = await worker.fetch(new Request("https://ace.test/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ace.test", "cf-connecting-ip": "192.0.2.11" },
    body: JSON.stringify({ mode: "planner", input: { availableMinutes: 30, tasks: [] } })
  }), env, {});
  assert.equal(invalid.status, 400);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("worker API: proxy shape, secret header, validation and origin guard passed");
