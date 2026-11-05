import { cases, questions } from '../ai-healthcare/cases.js';

const cache = new Map();
const maxImageLength = 2_000_000;
let customWindowEnd = 0;
let customRequests = 0;

async function complete(messages, key) {
  const response = await fetch('https://gateway.9arm.co/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.8-27b-fp8',
      max_tokens: 800,
      messages,
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error('Gateway HTTP ' + response.status);
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error('Empty gateway response');
  return answer;
}

function explain(caseId, questionId, key) {
  return complete([
    { role: 'system', content: 'ตอบภาษาไทย 2–4 ประโยค ใช้เฉพาะข้อมูลเคสสมมติที่ให้มา อธิบายเพื่อการเรียนรู้ ห้ามวินิจฉัยหรือให้คำแนะนำการรักษา ห้ามอ้างว่าได้เห็นหรือประมวลผลภาพจริง' },
    { role: 'user', content: cases[caseId].detail + '\nคำถาม: ' + questions[questionId] },
  ], key);
}

async function handleCustom(body, caseId, response) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 600) {
    return response.status(400).json({ error: 'พิมพ์คำถามความยาว 1–600 ตัวอักษร' });
  }
  const { image } = body;
  if (typeof image === 'string' && image.length > maxImageLength) {
    return response.status(413).json({ error: 'รูปมีขนาดใหญ่เกินไป ลองใช้รูปขนาดเล็กลง' });
  }
  if (image !== undefined &&
      (typeof image !== 'string' || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image))) {
    return response.status(400).json({ error: 'เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปใหม่' });
  }

  const key = process.env.HEALTHCARE_PASSPORT_KEY;
  if (!key) return response.status(503).json({ error: 'โหมด AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' });

  const now = Date.now();
  if (now >= customWindowEnd) {
    customWindowEnd = now + 60_000;
    customRequests = 0;
  }
  if (customRequests >= 30) {
    response.setHeader('Retry-After', String(Math.ceil((customWindowEnd - now) / 1000)));
    return response.status(429).json({ error: 'มีคำถามเข้ามาหลายรายการ กรุณารอสักครู่แล้วส่งใหม่' });
  }
  customRequests++;

  const content = image
    ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }]
    : cases[caseId].detail + '\nคำถาม: ' + prompt;
  try {
    const answer = await complete([
      { role: 'system', content: 'คุณคือผู้ช่วยในเว็บเดโม AI Healthcare ตอบภาษาไทยอย่างกระชับเพื่อการเรียนรู้ อธิบายสิ่งที่เห็นอย่างระมัดระวัง หากภาพไม่ชัดให้บอกข้อจำกัด ห้ามวินิจฉัยโรค ประเมินภาวะฉุกเฉิน หรือแนะนำการรักษาจากภาพ ถ้าไม่มีรูปให้ตอบโดยอิงข้อความเคสเท่านั้น' },
      { role: 'user', content },
    ], key);
    return response.status(200).json({ answer });
  } catch {
    return response.status(502).json({ error: 'AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองอีกครั้ง' });
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'โปรดส่งคำถามด้วย POST' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ error: 'รูปแบบคำถามไม่ถูกต้อง' });
  }
  const { caseId, questionId } = body ?? {};
  if (typeof caseId !== 'string' || !Object.hasOwn(cases, caseId)) {
    return response.status(400).json({ error: 'กรุณาเลือกเคสจากหน้าเดโม' });
  }
  if (Object.hasOwn(body, 'prompt') || Object.hasOwn(body, 'image')) {
    return handleCustom(body, caseId, response);
  }
  if (typeof questionId !== 'string' || !Object.hasOwn(questions, questionId)) {
    return response.status(400).json({ error: 'กรุณาเลือกเคสและคำถามจากหน้าเดโม' });
  }
  const key = process.env.HEALTHCARE_PASSPORT_KEY;
  if (!key) return response.status(503).json({ error: 'โหมด AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' });

  const id = caseId + ':' + questionId;
  if (!cache.has(id)) {
    cache.set(id, explain(caseId, questionId, key).catch((error) => {
      cache.delete(id);
      throw error;
    }));
  }
  try {
    return response.status(200).json({ answer: await cache.get(id) });
  } catch {
    return response.status(502).json({ error: 'AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองอีกครั้ง' });
  }
}
