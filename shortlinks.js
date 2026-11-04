(() => {
  const STORE_KEY = 'taithai_short_links_v2';
  const input = document.getElementById('longUrl');
  const button = document.getElementById('createBtn');
  const result = document.getElementById('result');
  const codePattern = /^[A-Za-z0-9_-]{4,32}$/;
  const validUrl = value => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  };
  function readHistory() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function message(text) {
    result.style.display = 'block';
    result.textContent = text;
  }
  const parts = location.pathname.split('/').filter(Boolean);
  const code = new URLSearchParams(location.search).get('c') || (parts[0] === 'S' ? parts[1] : '');
  if (code && codePattern.test(code)) {
    if (/^g-[A-Za-z0-9_]{5,30}$/.test(code)) {
      message('กำลังเปิดลิงก์ปลายทาง…');
      location.replace(`/api/shortlinks?code=${encodeURIComponent(code)}`);
      return;
    }
    const saved = readHistory()[code]?.url;
    if (saved && validUrl(saved)) {
      location.replace(saved);
      return;
    }
    message('ลิงก์เก่านี้เก็บปลายทางไว้เฉพาะเบราว์เซอร์ที่สร้าง จึงเปิดจากอุปกรณ์นี้ไม่ได้ กรุณากลับไปเบราว์เซอร์เดิม นำลิงก์ปลายทางมาสร้างลิงก์ย่อและ QR ใหม่');
  }
  button.addEventListener('click', async () => {
    const url = input.value.trim();
    if (!validUrl(url)) { message('กรุณาใส่ URL ที่ถูกต้อง (http หรือ https)'); return; }
    button.disabled = true;
    message('กำลังสร้างลิงก์ที่เปิดข้ามอุปกรณ์ได้…');
    try {
      const response = await fetch('/api/shortlinks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'สร้างลิงก์ไม่สำเร็จ');
      const short = new URL(data.shortUrl);
      if (short.origin !== 'https://taithai.app' || !/^\/S\/g-[A-Za-z0-9_]{5,30}\/$/.test(short.pathname)) {
        throw new Error('ลิงก์ที่ได้รับไม่ถูกต้อง');
      }
      try {
        const history = readHistory();
        history[data.code] = { url, shortUrl: data.shortUrl, createdAt: Date.now() };
        localStorage.setItem(STORE_KEY, JSON.stringify(history));
      } catch { /* Browser storage is optional; the shared link already exists. */ }
      message('ลิงก์ย่อพร้อมใช้ข้ามอุปกรณ์และนำไปสร้าง QR ได้');
      const link = document.createElement('a');
      link.href = data.shortUrl;
      link.textContent = data.shortUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'คัดลอกลิงก์';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(data.shortUrl); copy.textContent = 'คัดลอกแล้ว ✓'; }
        catch { copy.textContent = 'กรุณาเลือกและคัดลอกลิงก์ด้านบน'; }
      });
      result.append(document.createElement('br'), link, document.createElement('br'), copy);
    } catch (error) { message(error.message || 'สร้างลิงก์ไม่สำเร็จ กรุณาลองใหม่'); }
    finally { button.disabled = false; }
  });
})();
