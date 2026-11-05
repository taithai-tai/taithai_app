import { cases, questions } from '../ai-healthcare/cases.js';

const cache = new Map();

async function explain(caseId, questionId, key) {
  const response = await fetch('https://gateway.9arm.co/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.8-27b-fp8',
      max_tokens: 800,
      messages: [
        { role: 'system', content: 'ตอบภาษาไทย 2–4 ประโยค ใช้เฉพาะข้อมูลเคสสมมติที่ให้มา อธิบายเพื่อการเรียนรู้ ห้ามวินิจฉัยหรือให้คำแนะนำการรักษา ห้ามอ้างว่าได้เห็นหรือประมวลผลภาพจริง' },
        { role: 'user', content: cases[caseId].detail + '\nคำถาม: ' + questions[questionId] },
      ],
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error('Gateway HTTP ' + response.status);
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error('Empty gateway response');
  return answer;
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
  if (typeof caseId !== 'string' || typeof questionId !== 'string' ||
      !Object.hasOwn(cases, caseId) || !Object.hasOwn(questions, questionId)) {
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
