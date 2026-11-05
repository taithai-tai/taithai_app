import { cases, questions } from './cases.js';

const select = document.querySelector('#case');
const markers = document.querySelector('#markers');
const images = document.querySelector('#images');
const observation = document.querySelector('#observation');
const answer = document.querySelector('#answer');
const questionsBox = document.querySelector('#questions');
let activeRequest;

for (const [id, item] of Object.entries(cases)) select.add(new Option(item.label, id));

function illustration(id, later) {
  const wrist = id === 'wrist';
  const structure = wrist
    ? '<g fill="#a6c4d8" stroke="#e1f1fb" stroke-width="2"><path d="M122 254 L126 137 Q105 116 115 97 Q141 82 168 105 Q176 121 161 144 L157 254Z"/><path d="M192 254 L191 145 Q180 128 191 112 Q210 100 221 120 L216 254Z"/><ellipse cx="126" cy="68" rx="17" ry="16"/><ellipse cx="163" cy="66" rx="18" ry="17"/><ellipse cx="199" cy="71" rx="16" ry="16"/><ellipse cx="150" cy="38" rx="13" ry="14"/><ellipse cx="181" cy="40" rx="13" ry="14"/></g>'
    : '<g stroke="#aac6dc" stroke-width="3" fill="#29465e"><path d="M151 52 C92 39 61 97 63 165 Q66 211 142 199 Q158 170 151 52Z"/><path d="M185 52 C243 39 275 97 272 165 Q269 211 194 199 Q178 170 185 52Z"/><path d="M168 40V207" stroke-width="12" opacity=".55"/><path d="M68 83Q111 64 151 89M64 111Q110 91 151 116M63 139Q108 118 151 142M65 166Q108 146 151 169M186 89Q226 64 268 83M186 116Q226 91 273 111M186 142Q226 118 273 139M186 169Q226 146 271 166" fill="none" opacity=".7"/></g>';
  const change = wrist
    ? '<path d="M125 134l10 6 8-5 10 6 10-4" fill="none" stroke="#14283c" stroke-width="4" opacity="' + (later ? '.27' : '.95') + '"/>'
    : '<ellipse cx="226" cy="165" rx="' + (later ? 12 : 24) + '" ry="' + (later ? 8 : 15) + '" fill="#d9ecfa" opacity="' + (later ? '.42' : '.68') + '"/>';
  const focus = markers.checked
    ? '<circle cx="' + (wrist ? 144 : 226) + '" cy="' + (wrist ? 138 : 165) + '" r="31" fill="none" stroke="#ffcd7a" stroke-width="3" stroke-dasharray="5 4"/>'
    : '';
  return '<svg viewBox="0 0 336 238" role="img" aria-label="แผนภาพจำลอง"><rect width="336" height="238" fill="#14273b"/>' + structure + change + focus + '</svg>';
}

function renderCase() {
  const item = cases[select.value];
  images.innerHTML = item.times.map((caption, i) =>
    '<figure>' + illustration(select.value, i === 1) + '<figcaption>' + caption + ' · ภาพจำลอง</figcaption></figure>'
  ).join('');
  observation.textContent = markers.checked ? item.detail : 'ลองเปรียบเทียบตำแหน่งเดียวกันในสองภาพ แล้วเปิดจุดสังเกต';
}

for (const [id, label] of Object.entries(questions)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', async () => {
    activeRequest?.abort();
    const request = new AbortController();
    activeRequest = request;
    for (const item of questionsBox.children) item.setAttribute('aria-pressed', String(item === button));
    answer.textContent = 'กำลังขอคำอธิบายจาก AI…';
    try {
      const response = await fetch('/api/healthcare-learning/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: select.value, questionId: id }),
        signal: request.signal,
      });
      const result = await response.json();
      if (activeRequest === request) answer.textContent = response.ok ? result.answer : result.error;
    } catch (error) {
      if (error.name !== 'AbortError' && activeRequest === request) {
        answer.textContent = 'เชื่อมต่อ AI ไม่สำเร็จ ลองใหม่อีกครั้ง';
      }
    }
  });
  questionsBox.append(button);
}

select.addEventListener('change', () => {
  activeRequest?.abort();
  activeRequest = undefined;
  for (const button of questionsBox.children) button.setAttribute('aria-pressed', 'false');
  answer.textContent = 'เลือกคำถามเพื่อถาม AI เกี่ยวกับเคสนี้';
  renderCase();
});
markers.addEventListener('change', renderCase);
renderCase();
