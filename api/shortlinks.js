const CODE = /^g-([A-Za-z0-9_]{5,30})$/;
const LEGACY_CODE = /^[A-Za-z0-9]{4,32}$/;

export function validDestination(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function createHandler(fetchImpl = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, data) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };
    const redirect = destination => {
      res.statusCode = 302;
      res.setHeader('Location', destination);
      res.end();
    };
    const code = req.query?.code ?? new URL(req.url, 'https://taithai.app').searchParams.get('code');
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (typeof code !== 'string') return json(400, { error: 'ไม่พบรหัสลิงก์' });
      const match = code.match(CODE);
      if (match) return redirect(`https://is.gd/${match[1]}`);
      if (LEGACY_CODE.test(code)) return redirect(`/S/?c=${encodeURIComponent(code)}`);
      return json(404, { error: 'รหัสลิงก์ไม่ถูกต้อง' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return json(405, { error: 'ไม่รองรับคำขอนี้' });
    }
    try {
      let body = req.body;
      if (body === undefined) {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += Buffer.byteLength(chunk);
          if (length > 16384) return json(413, { error: 'ลิงก์ยาวเกินไป' });
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (typeof body === 'string') {
        try { body = JSON.parse(body); }
        catch { return json(400, { error: 'ข้อมูลไม่ถูกต้อง' }); }
      }
      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      if (!url || url.length > 4096 || !validDestination(url)) {
        return json(400, { error: 'กรุณาใส่ลิงก์ http หรือ https ที่ถูกต้อง ความยาวไม่เกิน 4,096 ตัวอักษร' });
      }
      const upstream = await fetchImpl('https://is.gd/create.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ format: 'json', url }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await upstream.json();
      if (result.errorcode === 3) {
        res.setHeader('Retry-After', '60');
        return json(429, { error: 'สร้างลิงก์ถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่' });
      }
      if (!upstream.ok || result.errorcode || typeof result.shorturl !== 'string') {
        return json(502, { error: 'บริการลิงก์ย่อไม่สามารถสร้างลิงก์นี้ได้ กรุณาลองใหม่ภายหลัง' });
      }
      const short = new URL(result.shorturl);
      const token = short.pathname.slice(1);
      if (short.origin !== 'https://is.gd' || !/^[A-Za-z0-9_]{5,30}$/.test(token)) {
        return json(502, { error: 'บริการลิงก์ย่อตอบกลับไม่ถูกต้อง' });
      }
      return json(201, { code: `g-${token}`, shortUrl: `https://taithai.app/S/g-${token}/` });
    } catch {
      return json(503, { error: 'เชื่อมต่อบริการลิงก์ย่อไม่ได้ กรุณาลองใหม่' });
    }
  };
}

export default createHandler();
