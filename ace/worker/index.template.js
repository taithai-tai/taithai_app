const ASSETS = typeof ACE_ASSET_MAP === 'undefined' ? {} : ACE_ASSET_MAP;
const AI_PATH = "/api/ai";
const REQUEST_LIMIT = 8;
const WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 20_000;
const AI_TIMEOUT_MS = 120_000;
const MAX_ANSWER_CHARS = 24_000;
const rateWindows = new Map();

const securityHeaders = {
  "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...securityHeaders, ...extraHeaders }
  });
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function clientFingerprint(request) {
  const source = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(request) {
  const key = await clientFingerprint(request);
  const now = Date.now();
  const existing = rateWindows.get(key);
  if (!existing || now >= existing.resetAt) {
    rateWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: REQUEST_LIMIT - 1 };
  }
  if (existing.count >= REQUEST_LIMIT) return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  existing.count += 1;
  return { allowed: true, remaining: REQUEST_LIMIT - existing.count };
}

function validatePlanner(input) {
  if (!Number.isInteger(input?.availableMinutes) || input.availableMinutes < 1 || input.availableMinutes > 1_440) throw new Error("ข้อมูลเวลาที่มีไม่ถูกต้อง");
  if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 30) throw new Error("ต้องมีงาน 1–30 รายการ");
  const tasks = input.tasks.map((task, index) => {
    const name = typeof task?.name === "string" ? task.name.trim() : "";
    if (!name || name.length > 160) throw new Error("ชื่องานไม่ถูกต้อง");
    if (!Number.isInteger(task.duration) || task.duration < 1 || task.duration > 1_440) throw new Error("ระยะเวลางานไม่ถูกต้อง");
    if (!["high", "medium", "low"].includes(task.priority)) throw new Error("ระดับความสำคัญไม่ถูกต้อง");
    return { name, duration: task.duration, priority: task.priority, index };
  });
  const rank = { high: 0, medium: 1, low: 2 };
  const ordered = [...tasks].sort((a, b) => rank[a.priority] - rank[b.priority] || a.index - b.index);
  const scheduled = [];
  const overflow = [];
  let used = 0;
  for (const task of ordered) {
    if (used + task.duration <= input.availableMinutes) {
      scheduled.push(task);
      used += task.duration;
    } else overflow.push(task);
  }
  return { availableMinutes: input.availableMinutes, tasks, scheduled, overflow, used, remaining: input.availableMinutes - used };
}

function buildPrompt(mode, input) {
  if (mode === "planner") {
    const plan = validatePlanner(input);
    return {
      system: "คุณคือ ACE ผู้ช่วยวางแผนชีวิตประจำวัน ตอบภาษาไทยแบบกระชับ ใช้เฉพาะข้อมูลที่ได้รับ ห้ามเปลี่ยนเวลาหรือลำดับในแผนที่คำนวณแล้ว ห้ามอ้างว่าบันทึกลงปฏิทินหรือแจ้งเตือนแล้ว ให้เสนอคำแนะนำเริ่มต้น 2–4 ข้อ และบอกสิ่งที่ผู้ใช้ยังต้องตัดสินใจ",
      user: `ช่วยให้คำแนะนำประกอบแผนที่ระบบคำนวณตามกฎแล้ว ข้อมูลคือ ${JSON.stringify(plan)}`
    };
  }
  if (mode === "summary") {
    const source = typeof input?.source === "string" ? input.source.trim() : "";
    if (!source || source.length > 6_000) throw new Error("ข้อความสำหรับสรุปไม่ถูกต้อง");
    return {
      system: "คุณคือ ACE ผู้ช่วยจัดข้อมูล ตอบภาษาไทยโดยใช้เฉพาะต้นฉบับ ห้ามแต่งชื่อ วันส่ง ผู้รับผิดชอบ ตัวเลข หรือข้อเท็จจริง หากต้นฉบับไม่มีข้อมูลให้เขียนว่า ‘ไม่ได้ระบุ’ จัดผลลัพธ์เป็น 3 หัวข้อ: ประเด็นสำคัญ, งานที่ต้องทำ, สิ่งที่ต้นฉบับไม่ได้ระบุ",
      user: `สรุปต้นฉบับต่อไปนี้:\n\n${source}`
    };
  }
  if (mode === "writer") {
    const allowedTypes = ["appointment", "email", "follow-up"];
    const allowedTones = ["formal", "friendly", "concise"];
    const recipient = typeof input?.recipient === "string" ? input.recipient.trim() : "";
    const points = typeof input?.points === "string" ? input.points.trim() : "";
    if (!allowedTypes.includes(input?.type) || !allowedTones.includes(input?.tone)) throw new Error("รูปแบบข้อความไม่ถูกต้อง");
    if (!recipient || recipient.length > 100 || !points || points.length > 1_200) throw new Error("ข้อมูลผู้รับหรือประเด็นไม่ถูกต้อง");
    return {
      system: "คุณคือ ACE ผู้ช่วยร่างข้อความภาษาไทย ใช้เฉพาะข้อเท็จจริงที่ผู้ใช้ให้ ห้ามแต่งเหตุผล เหตุการณ์ วันเวลา หรือคำยืนยันเพิ่มเติม ส่งกลับเฉพาะร่างข้อความที่พร้อมแก้ไขต่อ และห้ามอ้างว่าส่งข้อความแล้ว",
      user: `ประเภท=${input.type}\nผู้รับ=${recipient}\nระดับภาษา=${input.tone}\nประเด็นที่ต้องสื่อ=${points}`
    };
  }
  throw new Error("ไม่รู้จักโหมดที่เลือก");
}

export async function handleAI(request, env) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) return json({ ok: false, error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ ok: false, error: "รูปแบบคำขอไม่ถูกต้อง" }, 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json({ ok: false, error: "ข้อมูลยาวเกินขนาดที่รองรับ" }, 413);
  if (!env?.NINEARM_API_KEY) return json({ ok: false, error: "ระบบ AI ยังไม่พร้อมใช้งาน" }, 503);

  const rate = await checkRateLimit(request);
  if (!rate.allowed) return json({ ok: false, error: "ใช้งานถี่เกินไป โปรดลองใหม่ในอีกสักครู่" }, 429, { "retry-after": String(rate.retryAfter) });

  let body;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: "ข้อมูลยาวเกินขนาดที่รองรับ" }, 413);
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "อ่านข้อมูลที่ส่งมาไม่ได้" }, 400);
  }

  let prompt;
  try {
    prompt = buildPrompt(body?.mode, body?.input);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, 400);
  }

  const baseUrl = (env.NINEARM_BASE_URL || "https://gateway.9arm.co/v1").replace(/\/+$/, "");
  const model = env.NINEARM_MODEL || "qwen3.8-27b-fp8";
  if (!baseUrl.startsWith("https://")) return json({ ok: false, error: "การตั้งค่าระบบ AI ไม่ปลอดภัย" }, 503);

  const controller = new AbortController();
  const cancelled = () => controller.abort();
  request.signal?.addEventListener("abort", cancelled, { once: true });
  if (request.signal?.aborted) controller.abort();

  async function generate(onText) {
    let timedOut = false;
    const startedAt = Date.now();
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, AI_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.NINEARM_API_KEY}`, "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ],
        temperature: 0.25,
        max_tokens: 1800,
        stream: true,
        // Qwen's documented switch: reserve generation for the user-facing answer.
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: controller.signal
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        if (upstream.status === 429) throw aiError("AI_BUSY", "ACE AI มีคำขอจำนวนมาก โปรดรอสักครู่แล้วลองใหม่", 429);
        if ([401, 403].includes(upstream.status)) throw aiError("AI_ACCESS", "ระบบเชื่อมต่อ AI ยังไม่พร้อม ผู้จัดทำต้องตรวจการตั้งค่าการเข้าถึง", 503);
        throw aiError("AI_UPSTREAM", "ACE AI ตอบกลับไม่สำเร็จ โปรดลองใหม่อีกครั้ง", 502);
      }
      return await readAIAnswer(upstream, onText);
    } catch (error) {
      const failure = timedOut
        ? aiError("AI_TIMEOUT", "ACE AI ใช้เวลานานเกินไป ข้อมูลที่กรอกยังอยู่ ลองลดความยาวแล้วกดใหม่", 504)
        : error?.code?.startsWith("AI_") ? error
        : aiError("AI_CONNECTION", "การเชื่อมต่อ ACE AI ขัดข้อง ข้อมูลที่กรอกยังอยู่ โปรดลองใหม่", 502);
      // No prompts, answers, personal data, upstream bodies or credentials in logs.
      if (!request.signal?.aborted) console.warn(JSON.stringify({ event: "ai_request_failed", mode: body.mode, code: failure.code, elapsedMs: Date.now() - startedAt }));
      throw failure;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", cancelled);
    }
  }

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return streamAIResponse(generate, controller, rate.remaining);
  }
  // Older cached clients still receive their established JSON response format.
  try {
    const content = await generate(() => {});
    return json({ ok: true, content }, 200, { "x-rate-limit-remaining": String(rate.remaining) });
  } catch (error) {
    return json({ ok: false, error: error.message, code: error.code }, error.status || 502);
  }
}

function aiError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}

async function readAIAnswer(response, onText) {
  let answer = "";
  let finished = false;
  let finishReason = null;
  function acceptChoice(chunk) {
    if (chunk.error) throw aiError("AI_UPSTREAM", "ACE AI หยุดตอบระหว่างทาง โปรดลองใหม่");
    const choice = chunk.choices?.[0];
    // Never use reasoning_content as an answer or send it to the browser.
    const text = choice?.delta?.content ?? choice?.message?.content;
    if (typeof text === "string" && text) {
      answer += text;
      if (answer.length > MAX_ANSWER_CHARS) throw aiError("AI_TOO_LONG", "คำตอบยาวเกินขอบเขต โปรดลองด้วยข้อมูลที่สั้นลง");
      onText(text);
    }
    if (choice?.finish_reason) { finished = true; finishReason = choice.finish_reason; }
  }
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = response.body?.getReader();
    if (!reader) throw aiError("AI_EMPTY", "ยังไม่ได้รับคำตอบจาก ACE AI โปรดลองใหม่");
    const decoder = new TextDecoder();
    let buffer = "";
    function consume(line) {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (data === "[DONE]") { finished = true; return; }
      if (data) acceptChoice(JSON.parse(data));
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, index).replace(/\r$/, ""));
          buffer = buffer.slice(index + 1);
        }
        if (buffer.length > 100_000) throw aiError("AI_FORMAT", "อ่านคำตอบจาก ACE AI ไม่ได้ โปรดลองใหม่");
        if (done) { if (buffer.trim()) consume(buffer.trim()); break; }
        if (finished) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else {
    acceptChoice(await response.json());
    finished = true;
  }
  if (!finished) throw aiError("AI_INTERRUPTED", "คำตอบขาดช่วง ยังไม่ใช่คำตอบที่สมบูรณ์ โปรดลองใหม่");
  if (finishReason === "length") throw aiError("AI_TRUNCATED", "AI ยังตอบไม่ครบ ลองลดข้อมูลหรือแบ่งเป็นคำขอที่สั้นลง");
  if (finishReason && finishReason !== "stop") throw aiError("AI_INCOMPLETE", "AI ยังสร้างคำตอบไม่สำเร็จ โปรดปรับข้อความแล้วลองใหม่");
  if (!answer.trim()) throw aiError("AI_EMPTY", "ยังไม่ได้รับคำตอบจาก ACE AI โปรดลองใหม่");
  return answer.trim();
}

function streamAIResponse(generate, abortController, remaining) {
  const encoder = new TextEncoder();
  let cancelled = false;
  let heartbeat;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      emit({ type: "status", message: "กำลังติดต่อ ACE AI…" });
      heartbeat = setInterval(() => emit({ type: "status", message: "กำลังรอคำตอบจาก ACE AI…" }), 15_000);
      void (async () => {
        try {
          await generate(text => emit({ type: "delta", text }));
          emit({ type: "done" });
        } catch (error) {
          emit({ type: "error", error: error.message, code: error.code });
        } finally {
          clearInterval(heartbeat);
          if (!cancelled) controller.close();
        }
      })();
    },
    cancel() { cancelled = true; clearInterval(heartbeat); abortController.abort(); }
  });
  return new Response(stream, { headers: {
    ...securityHeaders, "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store, no-transform", "x-content-type-options": "nosniff",
    "x-rate-limit-remaining": String(remaining)
  } });
}

function serveAsset(request, pathname) {
  const asset = ASSETS[pathname];
  if (!asset) return null;
  // Unfingerprinted asset paths must revalidate after a publication. Otherwise a
  // freshly loaded page can run an older cached renderer and show the old model.
  // Keep bytes reusable with a content ETag instead of downloading every visit.
  const headers = {
    "content-type": asset.contentType,
    "cache-control": "private, no-cache, must-revalidate",
    etag: asset.etag,
    ...securityHeaders
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some(value => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === asset.etag;
  })) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : decodeBase64(asset.body), {
    status: 200,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);
    if (url.pathname === AI_PATH) {
      if (request.method !== "POST") return json({ ok: false, error: "รองรับเฉพาะ POST" }, 405, { allow: "POST" });
      return handleAI(request, env);
    }
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD", ...securityHeaders } });
    return serveAsset(request, url.pathname) || new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...securityHeaders } });
  }
};
