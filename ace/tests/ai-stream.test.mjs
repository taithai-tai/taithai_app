import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import worker from "../dist/server/index.js";

const env = { NINEARM_API_KEY: "test-secret-not-a-real-key" };
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const warnings = [];
const encoder = new TextEncoder();
let ip = 20;
let captured;
const inputs = {
  planner: { availableMinutes: 60, tasks: [{ name: "อ่านบทเรียน", duration: 45, priority: "high" }, { name: "ฝึกกีตาร์", duration: 20, priority: "low" }] },
  summary: { source: "กิจกรรมแลกหนังสือ ต้องเตรียมโต๊ะ ยังไม่ได้กำหนดผู้รับผิดชอบ" },
  writer: { type: "appointment", recipient: "อาจารย์", points: "ขอปรึกษางานกลุ่ม", tone: "formal" }
};

function request(mode = "writer", accept = "application/x-ndjson") {
  return new Request("https://ace.test/api/ai", { method: "POST", headers: {
    "content-type": "application/json", accept, origin: "https://ace.test", "cf-connecting-ip": `192.0.2.${ip++}`
  }, body: JSON.stringify({ mode, input: inputs[mode] }) });
}
function eventResponse(lines, fragment = 13) {
  const bytes = encoder.encode(lines.join("\r\n") + "\r\n");
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset + fragment)); offset += fragment;
  } }), { headers: { "content-type": "text/event-stream" } });
}
function answerResponse(finish = "stop") {
  return eventResponse([
    ': heartbeat', '',
    'data: {"choices":[{"delta":{"reasoning_content":"PRIVATE_REASONING"}}]}', '',
    `data: ${JSON.stringify({ choices: [{ delta: { content: "เรียนอาจารย์\n" } }] })}`, '',
    `data: ${JSON.stringify({ choices: [{ delta: { content: "ขอปรึกษางานกลุ่มครับ" }, finish_reason: finish }] })}`, '',
    'data: [DONE]', ''
  ]);
}
function client(fetcher) {
  const context = vm.createContext({ window: {}, fetch: fetcher, AbortController, DOMException, TextDecoder, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(new URL("../site/assets/ai-client.js", import.meta.url), "utf8"), context);
  return context.window.ACE_AI.request;
}
const runClient = client((url, init) => worker.fetch(new Request("https://ace.test" + url, {
  ...init, headers: { ...init.headers, origin: "https://ace.test", "cf-connecting-ip": `192.0.2.${ip++}` }
}), env, {}));

try {
  console.warn = (message) => warnings.push(message);
  globalThis.fetch = async (url, init) => { captured = { url, init }; return answerResponse(); };
  for (const mode of Object.keys(inputs)) {
    const progress = [];
    const answer = await runClient(mode, inputs[mode], undefined, text => progress.push(text));
    assert.equal(answer, "เรียนอาจารย์\nขอปรึกษางานกลุ่มครับ");
    assert.equal(progress.length, 2);
    assert.ok(progress.every(text => !text.includes("PRIVATE_REASONING")));
    const sent = JSON.parse(captured.init.body);
    assert.equal(sent.stream, true);
    assert.equal(sent.chat_template_kwargs.enable_thinking, false);
    assert.match(sent.messages[1].content, mode === "planner" ? /อ่านบทเรียน/ : mode === "summary" ? /แลกหนังสือ/ : /อาจารย์/);
  }

  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response("private upstream error", { status });
    await assert.rejects(runClient("writer", inputs.writer), status === 429 ? /คำขอจำนวนมาก/ : status < 500 ? /ตั้งค่าการเข้าถึง/ : /ตอบกลับไม่สำเร็จ/);
  }
  globalThis.fetch = async () => answerResponse("length");
  await assert.rejects(runClient("writer", inputs.writer), /ยังตอบไม่ครบ/);
  globalThis.fetch = async () => eventResponse(['data: {"choices":[{"delta":{"content":"ร่างบางส่วน"}}]}']);
  await assert.rejects(runClient("writer", inputs.writer), /ขาดช่วง/);
  globalThis.fetch = async () => eventResponse(['data: [DONE]']);
  await assert.rejects(runClient("writer", inputs.writer), /ยังไม่ได้รับคำตอบ/);
  globalThis.fetch = async () => eventResponse(['data: {broken']);
  await assert.rejects(runClient("writer", inputs.writer), /ขัดข้อง/);

  // An established JSON client still works after the transport change.
  globalThis.fetch = async () => answerResponse();
  const legacy = await worker.fetch(request("writer", "application/json"), env, {});
  assert.deepEqual(await legacy.json(), { ok: true, content: "เรียนอาจารย์\nขอปรึกษางานกลุ่มครับ" });

  // Simulate elapsed time, rather than spending two real minutes waiting in a test.
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  }
  try {
    globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
    let release;
    let upstreamSignal;
    globalThis.fetch = (url, init) => { upstreamSignal = init.signal; return new Promise((resolve, reject) => {
      release = resolve;
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }); };
    const slow = await worker.fetch(request(), env, {});
    assert.match(slow.headers.get("content-type"), /application\/x-ndjson/);
    const reader = slow.body.getReader();
    const first = await reader.read();
    assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type, "status");
    advance(31_000);
    assert.equal(upstreamSignal.aborted, false, "must survive the old 30-second limit");
    release(answerResponse());
    let rest = "";
    while (true) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value); }
    assert.match(rest, /"type":"done"/);
    assert.equal(timers.size, 0);

    const timeout = await worker.fetch(request(), env, {});
    advance(120_000);
    const failure = await timeout.text();
    assert.match(failure, /AI_TIMEOUT/);
    assert.doesNotMatch(failure, /"type":"done"/);
    assert.equal(upstreamSignal.aborted, true);

    const cancel = await worker.fetch(request(), env, {});
    const cancelReader = cancel.body.getReader();
    await cancelReader.read();
    await cancelReader.cancel();
    assert.equal(upstreamSignal.aborted, true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }

  const brokenClient = client(async () => new Response('{"type":"delta","text":"ไม่ครบ"}\n', { headers: { "content-type": "application/x-ndjson" } }));
  await assert.rejects(brokenClient("writer", inputs.writer), /ขาดช่วง/);
  const jsonClient = client(async () => new Response(JSON.stringify({ ok: true, content: "คำตอบเดิม" }), { headers: { "content-type": "application/json" } }));
  assert.equal(await jsonClient("writer", inputs.writer), "คำตอบเดิม");

  for (const path of ["site/demo/index.html", "site/privacy/index.html", "site/assets/demo.js", "site/assets/ai-client.js", "site/assets/site-data.js"]) {
    assert.doesNotMatch(fs.readFileSync(new URL("../" + path, import.meta.url), "utf8"), /9arm|นายอา?ร์?ม|qwen3/i);
  }
  assert.ok(warnings.length > 0);
  assert.doesNotMatch(warnings.join(""), /test-secret|PRIVATE_REASONING|อาจารย์|private upstream/);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}
console.log("AI stream integration (mock provider): 3 modes, fragmented Thai UTF-8, partial progress, no reasoning leak, upstream errors, truncation, cancellation, >30s delay, 120s timeout and legacy clients passed");
