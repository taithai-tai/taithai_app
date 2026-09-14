(function (global) {
  "use strict";

  const priorityScores = Object.freeze({ high: 3, medium: 2, low: 1 });

  function buildPlan(availableMinutes, tasks) {
    if (!Number.isInteger(availableMinutes) || availableMinutes <= 0) {
      throw new RangeError("availableMinutes must be a positive integer");
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new RangeError("at least one task is required");
    }
    const normalized = tasks.map((task, index) => {
      if (!task || !String(task.name || "").trim()) throw new TypeError("task name is required");
      if (!Number.isInteger(task.duration) || task.duration <= 0) throw new RangeError("task duration must be a positive integer");
      if (!(task.priority in priorityScores)) throw new TypeError("unknown priority");
      return { name: String(task.name).trim(), duration: task.duration, priority: task.priority, index: Number.isInteger(task.index) ? task.index : index };
    });
    const sorted = [...normalized].sort((a, b) => priorityScores[b.priority] - priorityScores[a.priority] || a.index - b.index);
    let remaining = availableMinutes;
    const scheduled = [];
    const overflow = [];
    sorted.forEach((task) => {
      if (task.duration <= remaining) {
        scheduled.push(task);
        remaining -= task.duration;
      } else {
        overflow.push(task);
      }
    });
    return {
      available: availableMinutes,
      total: normalized.reduce((sum, task) => sum + task.duration, 0),
      used: availableMinutes - remaining,
      remaining,
      scheduled,
      overflow
    };
  }

  function draftMessage(type, recipient, points, tone) {
    const cleanRecipient = String(recipient || "").trim();
    const cleanPoints = String(points || "").trim();
    if (!cleanRecipient || !cleanPoints) throw new TypeError("recipient and points are required");
    const subjects = { appointment: "ขอนัดพูดคุย", email: "แจ้งข้อมูล", "follow-up": "ติดตามเรื่องที่เคยพูดคุย" };
    const subject = subjects[type];
    if (!subject) throw new TypeError("unknown message type");
    const closings = {
      appointment: "รบกวนแจ้งช่วงเวลาที่สะดวกกลับมาครับ/ค่ะ",
      email: "หากมีข้อสงสัย โปรดแจ้งกลับมาได้เลยครับ/ค่ะ",
      "follow-up": "รบกวนแจ้งความคืบหน้ากลับมาครับ/ค่ะ"
    };
    const closing = closings[type];
    if (tone === "formal") return `เรื่อง ${subject}\n\nเรียน ${cleanRecipient}\n\nขออนุญาตติดต่อเกี่ยวกับเรื่องต่อไปนี้\n${cleanPoints}\n\n${closing}\n\nขอบคุณครับ/ค่ะ`;
    if (tone === "friendly") return `สวัสดี ${cleanRecipient}\n\nเรื่อง: ${subject}\n${cleanPoints}\n\n${closing} ขอบคุณครับ/ค่ะ`;
    if (tone === "concise") return `${cleanRecipient}\n\nติดต่อเรื่อง: ${subject}\nประเด็น: ${cleanPoints}\n\n${closing}`;
    throw new TypeError("unknown tone");
  }

  global.ACE_DEMO_ENGINE = Object.freeze({ buildPlan, draftMessage, priorityScores });
})(typeof window !== "undefined" ? window : globalThis);
