import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../site/assets/demo-engine.js", import.meta.url), "utf8");
vm.runInThisContext(source, { filename: "demo-engine.js" });
const { buildPlan, draftMessage } = globalThis.ACE_DEMO_ENGINE;

assert.throws(() => buildPlan(60, []), /at least one task/);
assert.throws(() => buildPlan(0, [{ name: "งาน", duration: 10, priority: "high" }]), /positive integer/);
assert.throws(() => buildPlan(60, [{ name: "งาน", duration: -1, priority: "high" }]), /positive integer/);
assert.throws(() => buildPlan(60, [{ name: "งาน", duration: 1.5, priority: "high" }]), /positive integer/);

const exact = buildPlan(90, [
  { name: "งานแรก", duration: 60, priority: "high", index: 0 },
  { name: "งานสอง", duration: 30, priority: "low", index: 1 }
]);
assert.equal(exact.used, 90);
assert.equal(exact.remaining, 0);
assert.equal(exact.overflow.length, 0);

const insufficient = buildPlan(60, [
  { name: "งานใหญ่", duration: 90, priority: "high", index: 0 },
  { name: "งานสั้น", duration: 30, priority: "medium", index: 1 },
  { name: "งานอีกชิ้น", duration: 40, priority: "low", index: 2 }
]);
assert.deepEqual(insufficient.scheduled.map((task) => task.name), ["งานสั้น"]);
assert.deepEqual(insufficient.overflow.map((task) => task.name), ["งานใหญ่", "งานอีกชิ้น"]);
assert.ok(insufficient.used <= insufficient.available);

const stable = buildPlan(40, [
  { name: "ลำดับหนึ่ง", duration: 20, priority: "medium", index: 0 },
  { name: "ลำดับสอง", duration: 20, priority: "medium", index: 1 }
]);
assert.deepEqual(stable.scheduled.map((task) => task.name), ["ลำดับหนึ่ง", "ลำดับสอง"]);

const formal = draftMessage("appointment", "อาจารย์ประจำวิชา", "ขอนัดคุยเรื่องงานกลุ่ม", "formal");
const friendly = draftMessage("appointment", "อาจารย์ประจำวิชา", "ขอนัดคุยเรื่องงานกลุ่ม", "friendly");
assert.match(formal, /อาจารย์ประจำวิชา/);
assert.match(formal, /ขอนัดคุยเรื่องงานกลุ่ม/);
assert.notEqual(formal, friendly);
assert.match(friendly, /สวัสดี/);
assert.notEqual(
  draftMessage("appointment", "อาจารย์", "ประเด็นเดิม", "friendly"),
  draftMessage("follow-up", "อาจารย์", "ประเด็นเดิม", "friendly")
);

console.log("demo-engine: 11 assertions passed");
