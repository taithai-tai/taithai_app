import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

vm.runInThisContext(fs.readFileSync(new URL("../site/assets/demo-engine.js", import.meta.url), "utf8"));
const { buildPlan, draftMessage, priorityScores } = globalThis.ACE_DEMO_ENGINE;

let seed = 428;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const priorities = ["high", "medium", "low"];

for (let run = 0; run < 3000; run += 1) {
  const count = 1 + Math.floor(random() * 12);
  const tasks = Array.from({ length: count }, (_, index) => ({
    name: `งานทดสอบยาว ${run}-${index} ${"ก".repeat(Math.floor(random() * 80))}`,
    duration: 1 + Math.floor(random() * 240),
    priority: priorities[Math.floor(random() * priorities.length)],
    index
  }));
  const available = 1 + Math.floor(random() * 720);
  const result = buildPlan(available, tasks);
  assert.ok(result.used <= available);
  assert.equal(result.remaining, available - result.used);
  assert.equal(result.scheduled.length + result.overflow.length, tasks.length);
  assert.equal(result.total, tasks.reduce((sum, task) => sum + task.duration, 0));
  const processed = [...result.scheduled, ...result.overflow];
  assert.equal(new Set(processed.map((task) => task.index)).size, tasks.length);
  for (let index = 1; index < result.scheduled.length; index += 1) {
    assert.ok(priorityScores[result.scheduled[index - 1].priority] >= priorityScores[result.scheduled[index].priority]);
  }
}

const drafts = new Set();
for (const type of ["appointment", "email", "follow-up"]) {
  for (const tone of ["formal", "friendly", "concise"]) {
    const draft = draftMessage(type, "อาจารย์ทดสอบ", "ประเด็นทดสอบที่ต้องนำไปใช้จริง", tone);
    assert.match(draft, /อาจารย์ทดสอบ/);
    assert.match(draft, /ประเด็นทดสอบที่ต้องนำไปใช้จริง/);
    drafts.add(draft);
  }
}
assert.equal(drafts.size, 9, "all type and tone combinations produce distinct drafts");

console.log("fuzz validation: 3,000 planner cases and 9 writer combinations passed");
