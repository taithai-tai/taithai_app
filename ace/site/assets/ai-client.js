(function () {
  "use strict";

  async function requestAI(mode, input, signal, onText) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 135_000);
    let reader;
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ mode, input }),
        signal: controller.signal
      });
      if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
        let result;
        try { result = await response.json(); }
        catch { throw new Error("อ่านคำตอบจากระบบไม่ได้ ลองโหลดหน้าใหม่แล้วกดอีกครั้ง"); }
        if (!response.ok || !result?.ok || typeof result.content !== "string" || !result.content.trim()) {
          throw new Error(result?.error || "ยังไม่ได้รับคำตอบจาก ACE AI");
        }
        onText?.(result.content.trim());
        return result.content.trim();
      }
      if (!response.ok || !response.body) throw new Error("เชื่อมต่อ ACE AI ไม่สำเร็จ โปรดลองใหม่");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let complete = false;
      function consume(line) {
        if (!line.trim()) return;
        let event;
        try { event = JSON.parse(line); }
        catch { throw new Error("อ่านคำตอบจาก ACE AI ไม่ได้ โปรดลองใหม่"); }
        if (event.type === "error") throw new Error(event.error || "ACE AI ตอบไม่สำเร็จ โปรดลองใหม่");
        if (event.type === "delta" && typeof event.text === "string") {
          content += event.text;
          if (content.length > 24_000) throw new Error("คำตอบยาวเกินไป โปรดแบ่งข้อมูลแล้วลองใหม่");
          onText?.(content);
        }
        if (event.type === "done") complete = true;
      }
      while (!complete) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
        }
        if (buffer.length > 100_000) throw new Error("อ่านคำตอบจาก ACE AI ไม่ได้ โปรดลองใหม่");
        if (done) { if (buffer.trim()) consume(buffer); break; }
      }
      if (!complete || !content.trim()) throw new Error("คำตอบขาดช่วงหรือยังไม่ครบ โปรดลองใหม่ ข้อมูลที่กรอกยังอยู่");
      return content.trim();
    } catch (error) {
      if (timedOut) throw new Error("ACE AI ใช้เวลานานเกินไป ข้อมูลที่กรอกยังอยู่ ลองลดความยาวแล้วกดใหม่");
      if (signal?.aborted) throw new DOMException("ยกเลิกคำขอแล้ว", "AbortError");
      if (error instanceof TypeError) throw new Error("การเชื่อมต่อขาดช่วง โปรดตรวจอินเทอร์เน็ตแล้วลองใหม่");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }

  window.ACE_AI = Object.freeze({ request: requestAI });

  if (typeof document !== 'undefined') {
    const showAvailability = async () => {
      const lead = document.querySelector('.page-hero .lead');
      if (!lead) return;
      const status = document.createElement('p');
      status.className = 'small muted';
      status.setAttribute('role', 'status');
      status.textContent = 'กำลังตรวจการตั้งค่า ACE AI…';
      lead.after(status);
      try {
        const response = await fetch('/api/ai', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        if (!response.ok) throw new Error('Status unavailable');
        const data = await response.json();
        status.textContent = data.configured
          ? 'โหมด AI จริง · ระบบจะยืนยันผลเมื่อได้รับคำตอบเท่านั้น'
          : 'ACE AI บนโฮสต์นี้ยังไม่พร้อม ผู้จัดทำต้องตั้งค่าการเชื่อมต่อก่อนใช้งาน ข้อมูลที่กรอกจะไม่ถูกแทนด้วยผลจำลอง';
        if (!data.configured) status.className = 'notice notice-warning';
      } catch {
        status.textContent = 'ยังตรวจสถานะการเชื่อมต่อไม่ได้ หากประมวลผลไม่สำเร็จ ระบบจะแจ้งข้อผิดพลาดโดยเก็บข้อมูลที่กรอกไว้';
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAvailability, { once: true });
    else showAvailability();
  }
})();
