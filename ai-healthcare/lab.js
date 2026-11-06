import { cases, questions } from './cases.js';

const galleryModule = import('./gallery.js').catch(() => null);

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

const form = document.querySelector('#ask-form');
const upload = document.querySelector('#upload');
const preview = document.querySelector('#preview');
const previewImage = document.querySelector('#preview-image');
const question = document.querySelector('#question');
const sendQuestion = document.querySelector('#send-question');
const customAnswer = document.querySelector('#custom-answer');
let previewUrl;
let reusedImage;
let publishedImageId;
let refreshGallery;
let accountVersion = 0;

galleryModule.then((gallery) => {
  if (!gallery) {
    document.querySelector('#history-status').textContent = 'ประวัติส่วนตัวไม่พร้อมใช้งาน กรุณาลองรีเฟรชหน้า';
    return;
  }
  refreshGallery = gallery.mountGallery((image) => {
    clearPreview();
    upload.value = '';
    reusedImage = image;
    previewImage.src = image;
    preview.hidden = false;
    customAnswer.textContent = 'เลือกรูปจากประวัติส่วนตัวแล้ว';
    question.focus();
  }, () => {
    accountVersion++;
    clearPreview();
    upload.value = '';
    question.value = '';
    customAnswer.textContent = 'คำตอบจะแสดงตรงนี้';
  });
});

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  reusedImage = undefined;
  publishedImageId = undefined;
  previewImage.removeAttribute('src');
  preview.hidden = true;
}

upload.addEventListener('change', () => {
  clearPreview();
  const file = upload.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    upload.value = '';
    customAnswer.textContent = 'เลือกไฟล์ JPEG, PNG หรือ WebP ขนาดไม่เกิน 10 MB';
    return;
  }
  previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  preview.hidden = false;
  customAnswer.textContent = 'แนบรูปแล้ว พร้อมส่งเมื่อคุณลงชื่อเข้าใช้';
});
document.querySelector('#remove-image').addEventListener('click', () => {
  upload.value = '';
  clearPreview();
  customAnswer.textContent = 'เอารูปออกแล้ว';
});

async function encodeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดรูปนี้ไม่ได้ ลองเปลี่ยนไฟล์แล้วส่งอีกครั้ง');
  }
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.83, 0.65, 0.42, 0.23]) {
      const image = canvas.toDataURL('image/jpeg', quality);
      if (image.length <= 400000) return image;
    }
    throw new Error('เปิดรูปได้ แต่รูปมีรายละเอียดมากเกินไป กรุณาลดขนาดรูปก่อนส่ง');
  } finally {
    bitmap.close();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sendQuestion.disabled) return;
  const prompt = question.value.trim();
  if (!prompt) {
    customAnswer.textContent = 'พิมพ์คำถามก่อนส่ง';
    question.focus();
    return;
  }

  const file = upload.files[0];
  const caseId = select.value;
  const previousImage = reusedImage;
  const version = accountVersion;
  sendQuestion.disabled = true;
  customAnswer.textContent = 'กำลังขอคำตอบจาก AI…';
  try {
    const image = file ? await encodeImage(file) : previousImage;
    if (version !== accountVersion) return;
    if (file && !publishedImageId) {
      const gallery = await galleryModule;
      if (version !== accountVersion) return;
      if (!gallery) {
        customAnswer.textContent = 'ประวัติส่วนตัวไม่พร้อมใช้งาน กรุณาลองใหม่';
        return;
      }
      if (!gallery.galleryUser()) {
        customAnswer.textContent = 'เข้าสู่ระบบ Google ที่ส่วนประวัติรูปของฉันก่อนส่งรูปใหม่';
        return;
      }
      const imageId = crypto.randomUUID();
      try {
        await gallery.saveImage(image, imageId);
      } catch {
        if (version !== accountVersion) return;
        customAnswer.textContent = 'บันทึกรูปลงประวัติส่วนตัวไม่สำเร็จ กรุณาลองใหม่';
        return;
      }
      if (version !== accountVersion) return;
      if (upload.files[0] === file) publishedImageId = imageId;
      void refreshGallery?.();
    }
    const response = await fetch('/api/healthcare-learning/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, prompt, image }),
    });
    const result = await response.json();
    if (version === accountVersion) customAnswer.textContent = response.ok ? result.answer : result.error;
  } catch (error) {
    if (version !== accountVersion) return;
    customAnswer.textContent = error.message.startsWith('เปิดรูป')
      ? error.message
      : 'เชื่อมต่อ AI ไม่สำเร็จ ลองใหม่อีกครั้ง';
  } finally {
    sendQuestion.disabled = false;
  }
});

document.querySelector('#xray-questions').addEventListener('click', (event) => {
  const preset = event.target.closest('button[data-prompt]');
  if (!preset) return;
  question.value = preset.dataset.prompt;
  question.focus();
});
