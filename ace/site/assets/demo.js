(function () {
  "use strict";

  const utils = window.ACE_UTILS;
  const engine = window.ACE_DEMO_ENGINE;

  function setStatus(element, status, message) {
    element.dataset.status = status;
    const text = element.querySelector("span:last-child");
    if (text) text.textContent = message;
  }

  function setBusy(panel, button, busy, busyLabel, normalLabel) {
    panel.setAttribute("aria-busy", String(busy));
    button.disabled = busy;
    button.textContent = busy ? busyLabel : normalLabel;
  }

  function clearFieldError(input, errorElement) {
    input.removeAttribute("aria-invalid");
    errorElement.textContent = "";
    errorElement.classList.remove("show");
  }

  function showFieldError(input, errorElement, message) {
    input.setAttribute("aria-invalid", "true");
    errorElement.textContent = message;
    errorElement.classList.add("show");
  }

  const requestAI = window.ACE_AI.request;

  function renderPlainText(container, text, className) {
    const block = document.createElement("div");
    block.className = className || "ai-output";
    block.textContent = text;
    container.appendChild(block);
    return block;
  }

  const tabButtons = Array.from(document.querySelectorAll("[role='tab']"));
  const tabPanels = Array.from(document.querySelectorAll("[role='tabpanel']"));

  function selectTab(mode, focus) {
    const selected = tabButtons.find((button) => button.dataset.mode === mode) || tabButtons[0];
    tabButtons.forEach((button) => {
      const active = button === selected;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== selected.getAttribute("aria-controls");
    });
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("mode", selected.dataset.mode);
    window.history.replaceState({}, "", nextUrl);
    if (focus) selected.focus();
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(button.dataset.mode, false));
    button.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabButtons.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabButtons.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        selectTab(tabButtons[nextIndex].dataset.mode, true);
      }
    });
  });

  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  selectTab(["planner", "summary", "writer"].includes(requestedMode) ? requestedMode : "planner", false);

  const plannerForm = document.getElementById("planner-form");
  const taskList = document.getElementById("task-list");
  const availableInput = document.getElementById("available-minutes");
  const plannerStatus = document.getElementById("planner-status");
  const plannerPanel = document.getElementById("planner-result-panel");
  const plannerResult = document.getElementById("planner-result");
  const plannerSubmit = document.getElementById("planner-submit");
  const copyPlan = document.getElementById("copy-plan");
  const exportPlan = document.getElementById("export-plan");
  let taskCounter = 0;
  let planText = "";
  let plannerRun = 0;
  let plannerController = null;
  let lastPlannerPromise = Promise.resolve();

  function taskTemplate(values = {}) {
    taskCounter += 1;
    const id = taskCounter;
    const name = utils.escapeHTML(values.name || "");
    const duration = values.duration || "";
    const priority = values.priority || "medium";
    const item = document.createElement("div");
    item.className = "task-item";
    item.dataset.taskId = String(id);
    item.innerHTML = `
      <div class="field task-name"><label for="task-name-${id}">ชื่องาน</label><input id="task-name-${id}" class="task-name-input" type="text" maxlength="160" value="${name}" aria-describedby="task-name-error-${id}" required><span class="field-error" id="task-name-error-${id}"></span></div>
      <div class="field"><label for="task-duration-${id}">นาที</label><input id="task-duration-${id}" class="task-duration-input" type="number" min="1" max="1440" step="1" inputmode="numeric" value="${duration}" aria-describedby="task-duration-error-${id}" required><span class="field-error" id="task-duration-error-${id}"></span></div>
      <div class="field"><label for="task-priority-${id}">ความสำคัญ</label><select id="task-priority-${id}" class="task-priority-input"><option value="high"${priority === "high" ? " selected" : ""}>สูง</option><option value="medium"${priority === "medium" ? " selected" : ""}>กลาง</option><option value="low"${priority === "low" ? " selected" : ""}>ต่ำ</option></select></div>
      <button class="icon-button task-remove" type="button" aria-label="ลบงาน ${name || id}">×</button>`;
    item.querySelector(".task-remove").addEventListener("click", () => item.remove());
    taskList.appendChild(item);
  }

  function loadPlannerDefaults() {
    taskList.innerHTML = "";
    taskCounter = 0;
    taskTemplate({ name: "ทำสไลด์งานกลุ่ม", duration: 60, priority: "high" });
    taskTemplate({ name: "อ่านสอบบทที่ 4", duration: 45, priority: "medium" });
    taskTemplate({ name: "ฝึกกีตาร์", duration: 30, priority: "low" });
  }
  loadPlannerDefaults();

  document.getElementById("add-task").addEventListener("click", () => {
    const listError = document.getElementById("task-list-error");
    listError.textContent = "";
    listError.classList.remove("show");
    if (taskList.children.length >= 30) {
      listError.textContent = "เพิ่มได้สูงสุด 30 งานต่อครั้ง";
      listError.classList.add("show");
      return;
    }
    taskTemplate();
    taskList.querySelector(".task-item:last-child input")?.focus();
  });

  function readPlanner() {
    let valid = true;
    let firstInvalid = null;
    const availableError = document.getElementById("available-error");
    const available = Number(availableInput.value);
    clearFieldError(availableInput, availableError);
    if (!Number.isInteger(available) || available <= 0 || available > 1440) {
      showFieldError(availableInput, availableError, "เวลาที่มีต้องเป็นจำนวนเต็ม 1–1,440 นาที");
      valid = false;
      firstInvalid = availableInput;
    }
    const items = Array.from(taskList.querySelectorAll(".task-item"));
    const listError = document.getElementById("task-list-error");
    listError.textContent = "";
    listError.classList.remove("show");
    if (!items.length) {
      listError.textContent = "ยังไม่มีงานในรายการ เพิ่มอย่างน้อย 1 งานเพื่อสร้างแผน";
      listError.classList.add("show");
      valid = false;
      firstInvalid ||= document.getElementById("add-task");
    }
    const tasks = items.map((item, index) => {
      const nameInput = item.querySelector(".task-name-input");
      const durationInput = item.querySelector(".task-duration-input");
      const nameError = item.querySelector("[id^='task-name-error-']");
      const durationError = item.querySelector("[id^='task-duration-error-']");
      clearFieldError(nameInput, nameError);
      clearFieldError(durationInput, durationError);
      const name = nameInput.value.trim();
      const duration = Number(durationInput.value);
      if (!name) {
        showFieldError(nameInput, nameError, "กรุณากรอกชื่องาน");
        valid = false;
        firstInvalid ||= nameInput;
      }
      if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) {
        showFieldError(durationInput, durationError, "ระยะเวลาต้องเป็นจำนวนเต็ม 1–1,440 นาที");
        valid = false;
        firstInvalid ||= durationInput;
      }
      return { name, duration, priority: item.querySelector(".task-priority-input").value, index };
    });
    return { valid, firstInvalid, available, tasks };
  }

  function renderPlan(input, plan) {
    const labels = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
    const scheduledHtml = plan.scheduled.length ? `<ol class="output-list">${plan.scheduled.map((task) => `<li><strong>${utils.escapeHTML(task.name)}</strong><br><span class="small muted">${utils.formatMinutes(task.duration)} · ความสำคัญ: ${labels[task.priority]}</span></li>`).join("")}</ol>` : '<p class="muted">ยังไม่มีงานที่ใส่ในเวลานี้ได้</p>';
    const overflowHtml = plan.overflow.length ? `<ul class="output-list">${plan.overflow.map((task) => `<li><strong>${utils.escapeHTML(task.name)}</strong><br><span class="small muted">ต้องใช้ ${utils.formatMinutes(task.duration)} · ความสำคัญ: ${labels[task.priority]}</span></li>`).join("")}</ul>` : '<p class="muted">ไม่มีงานเกินเวลา งานทั้งหมดอยู่ในแผนแล้ว</p>';
    plannerResult.innerHTML = `<div class="result-metrics"><div class="metric"><strong>${utils.formatMinutes(input.available)}</strong><span>เวลาที่มี</span></div><div class="metric"><strong>${utils.formatMinutes(plan.total)}</strong><span>เวลารวมทุกงาน</span></div><div class="metric"><strong>${utils.formatMinutes(plan.used)}</strong><span>เวลาในแผน</span></div><div class="metric"><strong>${utils.formatMinutes(plan.remaining)}</strong><span>เวลาที่เหลือ</span></div></div><div class="result-section"><h3>งานที่ใส่ในแผนได้ (${plan.scheduled.length})</h3>${scheduledHtml}</div><div class="result-section"><h3>งานที่ยังเกินเวลาว่าง (${plan.overflow.length})</h3>${overflowHtml}</div><div class="result-section"><h3>คำแนะนำจาก ACE AI</h3><div class="result-placeholder" id="planner-ai-advice">กำลังรอคำแนะนำจาก AI…</div></div>`;
    planText = `แผนงานวันนี้ — ACE\n\nเวลาที่มี: ${utils.formatMinutes(input.available)}\nเวลาที่ใช้ในแผน: ${utils.formatMinutes(plan.used)}\nเวลาที่เหลือ: ${utils.formatMinutes(plan.remaining)}\nเวลารวมทุกงาน: ${utils.formatMinutes(plan.total)}\n\nงานที่ใส่ในแผนได้\n${plan.scheduled.length ? plan.scheduled.map((task, index) => `${index + 1}. ${task.name} — ${utils.formatMinutes(task.duration)} — ความสำคัญ: ${labels[task.priority]}`).join("\n") : "ไม่มี"}\n\nงานที่ยังเกินเวลาว่าง\n${plan.overflow.length ? plan.overflow.map((task, index) => `${index + 1}. ${task.name} — ${utils.formatMinutes(task.duration)} — ความสำคัญ: ${labels[task.priority]}`).join("\n") : "ไม่มี"}`;
    copyPlan.disabled = false;
    exportPlan.disabled = false;
  }

  plannerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = readPlanner();
    if (!input.valid) {
      setStatus(plannerStatus, "incomplete", "ข้อมูลไม่ครบหรือไม่ถูกต้อง — โปรดตรวจช่องที่ระบุ");
      input.firstInvalid?.focus();
      return;
    }
    plannerController?.abort();
    plannerController = new AbortController();
    const runId = ++plannerRun;
    setStatus(plannerStatus, "loading", "กำลังคำนวณแผนและขอคำแนะนำจาก ACE AI…");
    setBusy(plannerPanel, plannerSubmit, true, "กำลังให้ AI ช่วย…", "แก้ไขแล้วสร้างใหม่");
    const plan = engine.buildPlan(input.available, input.tasks);
    renderPlan(input, plan);
    lastPlannerPromise = (async () => {
      try {
        const advice = await requestAI("planner", { availableMinutes: input.available, tasks: input.tasks }, plannerController.signal, (partial) => {
          if (runId !== plannerRun) return;
          const box = document.getElementById("planner-ai-advice");
          if (box) { box.className = "ai-output"; box.textContent = partial; }
          setStatus(plannerStatus, "loading", "กำลังรับคำแนะนำจาก ACE AI…");
        });
        if (runId !== plannerRun) return;
        const adviceBox = document.getElementById("planner-ai-advice");
        if (adviceBox) {
          adviceBox.className = "ai-output";
          adviceBox.textContent = advice;
        }
        planText += `\n\nคำแนะนำจาก ACE AI\n${advice}\n\nสร้างด้วย ACE AI โปรดตรวจสอบก่อนนำไปใช้`;
        setStatus(plannerStatus, "success", plan.overflow.length ? "สำเร็จ — คำนวณแผน แยกงานเกินเวลา และรับคำแนะนำจาก AI แล้ว" : "สำเร็จ — คำนวณแผนและรับคำแนะนำจาก AI แล้ว");
      } catch (error) {
        if (error?.name === "AbortError" || runId !== plannerRun) return;
        const adviceBox = document.getElementById("planner-ai-advice");
        if (adviceBox) {
          adviceBox.className = "notice notice-warning";
          adviceBox.textContent = `คำนวณแผนด้วยกฎสำเร็จ แต่ AI ยังให้คำแนะนำไม่ได้: ${error.message}`;
        }
        setStatus(plannerStatus, "error", `AI เกิดปัญหา — แผนที่คำนวณด้วยกฎยังใช้ได้ แต่ไม่มีคำแนะนำ AI: ${error.message}`);
      } finally {
        if (runId === plannerRun) setBusy(plannerPanel, plannerSubmit, false, "กำลังให้ AI ช่วย…", "แก้ไขแล้วสร้างใหม่");
      }
    })();
  });

  document.getElementById("planner-reset").addEventListener("click", () => {
    if (!window.confirm("ต้องการล้างข้อมูลและผลลัพธ์ของแผนงานหรือไม่?")) return;
    plannerRun += 1;
    plannerController?.abort();
    setBusy(plannerPanel, plannerSubmit, false, "กำลังให้ AI ช่วย…", "จัดแผนและขอคำแนะนำ AI");
    clearFieldError(availableInput, document.getElementById("available-error"));
    const listError = document.getElementById("task-list-error");
    listError.textContent = "";
    listError.classList.remove("show");
    availableInput.value = "";
    taskList.innerHTML = "";
    taskCounter = 0;
    taskTemplate();
    plannerResult.innerHTML = '<div class="result-placeholder">ผลลัพธ์จะแสดงเวลารวม งานที่ใส่ในแผนได้ งานที่ยังเกินเวลา และคำแนะนำจาก AI</div>';
    planText = "";
    copyPlan.disabled = true;
    exportPlan.disabled = true;
    setStatus(plannerStatus, "idle", "ก่อนเริ่ม — กรอกข้อมูลให้ครบ แล้วกดจัดแผน");
  });
  copyPlan.addEventListener("click", () => utils.copyText(planText, plannerResult));
  exportPlan.addEventListener("click", () => utils.exportText("ace-plan-ai.txt", planText));

  const fixtures = {
    "group-meeting": { source: "บันทึกประชุมงานกลุ่มวิชา IT 428 — วันพฤหัส\n\nหัวข้อเว็บ: บริการผู้ช่วย AI สำหรับชีวิตประจำวัน\nมีนทำโครงหน้าเว็บภายในวันจันทร์\nปาล์มรวบรวมคู่แข่งและคำค้นก่อนประชุมครั้งหน้า\nนัดตรวจงานอีกครั้งวันอังคาร เวลา 19:00 น.\nยังไม่ได้เลือกผู้รับผิดชอบส่วนการจัดการข้อมูล" },
    "activity-plan": { source: "บันทึกแผนกิจกรรมชมรม\n\nกิจกรรม: ตลาดนัดแลกหนังสือ\nสถานที่เสนอ: ลานหน้าอาคารเรียน\nต้องเตรียมโต๊ะ ป้ายประชาสัมพันธ์ และแบบลงทะเบียน\nอยากจัดช่วงปลายเดือนหน้า\nยังไม่ได้หารือเรื่องงบประมาณและผู้ประสานงานสถานที่" }
  };
  const summaryForm = document.getElementById("summary-form");
  const sampleSelect = document.getElementById("sample-document");
  const summaryStatus = document.getElementById("summary-status");
  const summaryPanel = document.getElementById("summary-result-panel");
  const summaryResult = document.getElementById("summary-result");
  const summarySubmit = document.getElementById("summary-submit");
  const copySummary = document.getElementById("copy-summary");
  const exportSummary = document.getElementById("export-summary");
  let summaryText = "";
  let summaryRun = 0;
  let summaryController = null;

  function showSource() {
    const preview = document.getElementById("source-preview");
    const fixture = fixtures[sampleSelect.value];
    if (preview) preview.textContent = fixture ? fixture.source : "โปรดเลือกเอกสารตัวอย่าง";
  }

  function resetSummaryView() {
    summaryRun += 1;
    summaryController?.abort();
    setBusy(summaryPanel, summarySubmit, false, "กำลังสรุปด้วย AI…", "สรุปด้วย AI");
    summaryResult.innerHTML = '<div class="source-box"><h3>ต้นฉบับ</h3><p class="source-text" id="source-preview"></p></div><div class="summary-box"><h3>สรุปจาก AI</h3><div class="result-placeholder">ประเด็นสำคัญ งานที่ต้องทำ และสิ่งที่ไม่ได้ระบุจะแสดงที่นี่</div></div>';
    showSource();
    summaryText = "";
    copySummary.disabled = true;
    exportSummary.disabled = true;
    clearFieldError(sampleSelect, document.getElementById("sample-document-error"));
    setStatus(summaryStatus, "idle", "ก่อนเริ่ม — เลือกเอกสารแล้วกดสรุปด้วย AI");
  }
  showSource();
  sampleSelect.addEventListener("change", resetSummaryView);

  summaryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fixture = fixtures[sampleSelect.value];
    if (!fixture) {
      showFieldError(sampleSelect, document.getElementById("sample-document-error"), "กรุณาเลือกเอกสารตัวอย่าง");
      setStatus(summaryStatus, "incomplete", "ข้อมูลไม่ครบ — โปรดเลือกเอกสารตัวอย่าง");
      sampleSelect.focus();
      return;
    }
    clearFieldError(sampleSelect, document.getElementById("sample-document-error"));
    summaryText = "";
    copySummary.disabled = true;
    exportSummary.disabled = true;
    summaryController?.abort();
    summaryController = new AbortController();
    const runId = ++summaryRun;
    setStatus(summaryStatus, "loading", "กำลังส่งเอกสารตัวอย่างให้ AI สรุป…");
    setBusy(summaryPanel, summarySubmit, true, "กำลังสรุปด้วย AI…", "เลือกเอกสารอื่นแล้วสรุปใหม่");
    summaryResult.innerHTML = `<div class="source-box"><h3>ต้นฉบับ</h3><p class="source-text">${utils.escapeHTML(fixture.source)}</p></div><div class="summary-box"><h3>สรุปจาก AI</h3><div class="result-placeholder">กำลังรอคำตอบจาก AI…</div></div>`;
    (async () => {
      try {
        const summary = await requestAI("summary", { source: fixture.source }, summaryController.signal, (partial) => {
          if (runId !== summaryRun) return;
          const box = summaryResult.querySelector(".summary-box");
          let output = box.querySelector(".ai-output");
          if (!output) { box.innerHTML = "<h3>สรุปจาก AI</h3>"; output = renderPlainText(box, ""); }
          output.textContent = partial;
          setStatus(summaryStatus, "loading", "กำลังรับสรุปจาก ACE AI…");
        });
        if (runId !== summaryRun) return;
        const summaryBox = summaryResult.querySelector(".summary-box");
        summaryBox.innerHTML = "<h3>สรุปจาก AI</h3>";
        renderPlainText(summaryBox, summary);
        summaryText = `สรุปโดย ACE AI\n\n${summary}\n\nสร้างด้วย ACE AI โปรดตรวจสอบกับต้นฉบับก่อนนำไปใช้`;
        copySummary.disabled = false;
        exportSummary.disabled = false;
        setStatus(summaryStatus, "success", "สำเร็จ — AI สรุปจากเอกสารตัวอย่างแล้ว โปรดตรวจเทียบกับต้นฉบับ");
      } catch (error) {
        if (error?.name === "AbortError" || runId !== summaryRun) return;
        const summaryBox = summaryResult.querySelector(".summary-box");
        summaryBox.innerHTML = "<h3>สรุปจาก AI</h3>";
        const notice = document.createElement("div");
        notice.className = "notice notice-warning";
        notice.textContent = `ยังสรุปไม่ได้: ${error.message} ระบบไม่ได้แสดงสรุปสำเร็จรูปแทน`;
        summaryBox.appendChild(notice);
        setStatus(summaryStatus, "error", `เกิดปัญหา — ${error.message}`);
      } finally {
        if (runId === summaryRun) setBusy(summaryPanel, summarySubmit, false, "กำลังสรุปด้วย AI…", "เลือกเอกสารอื่นแล้วสรุปใหม่");
      }
    })();
  });
  document.getElementById("summary-reset").addEventListener("click", resetSummaryView);
  copySummary.addEventListener("click", () => utils.copyText(summaryText, summaryResult));
  exportSummary.addEventListener("click", () => utils.exportText("ace-summary-ai.txt", summaryText));

  const writerForm = document.getElementById("writer-form");
  const writerStatus = document.getElementById("writer-status");
  const writerPanel = document.getElementById("writer-result-panel");
  const writerSubmit = document.getElementById("writer-submit");
  const writerOutput = document.getElementById("writer-output");
  const editWriter = document.getElementById("edit-writer");
  const copyWriter = document.getElementById("copy-writer");
  const exportWriter = document.getElementById("export-writer");
  let writerRun = 0;
  let writerController = null;
  let lastWriterPromise = Promise.resolve();

  writerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const recipient = document.getElementById("message-recipient");
    const points = document.getElementById("message-points");
    const recipientError = document.getElementById("recipient-error");
    const pointsError = document.getElementById("points-error");
    clearFieldError(recipient, recipientError);
    clearFieldError(points, pointsError);
    let firstInvalid = null;
    if (!recipient.value.trim()) {
      showFieldError(recipient, recipientError, "กรุณากรอกผู้รับ");
      firstInvalid = recipient;
    }
    if (!points.value.trim()) {
      showFieldError(points, pointsError, "กรุณากรอกประเด็นสำคัญที่ต้องการสื่อ");
      firstInvalid ||= points;
    }
    if (firstInvalid) {
      setStatus(writerStatus, "incomplete", "ข้อมูลไม่ครบ — โปรดตรวจช่องที่ระบุ");
      firstInvalid.focus();
      return;
    }
    const writerInput = { type: document.getElementById("message-type").value, recipient: recipient.value.trim(), points: points.value.trim(), tone: document.getElementById("message-tone").value };
    writerController?.abort();
    writerController = new AbortController();
    const runId = ++writerRun;
    writerOutput.value = "";
    writerOutput.readOnly = true;
    editWriter.disabled = true;
    copyWriter.disabled = true;
    exportWriter.disabled = true;
    setStatus(writerStatus, "loading", "กำลังส่งข้อมูลให้ AI ร่างข้อความ…");
    setBusy(writerPanel, writerSubmit, true, "กำลังสร้างร่างด้วย AI…", "แก้ข้อมูลแล้วสร้างใหม่");
    lastWriterPromise = (async () => {
      try {
        const draft = await requestAI("writer", writerInput, writerController.signal, (partial) => {
          if (runId !== writerRun) return;
          writerOutput.value = partial;
          setStatus(writerStatus, "loading", "กำลังรับร่างข้อความจาก ACE AI… ร่างยังไม่ครบ");
        });
        if (runId !== writerRun) return;
        writerOutput.value = draft;
        editWriter.disabled = false;
        copyWriter.disabled = false;
        exportWriter.disabled = false;
        setStatus(writerStatus, "success", "สำเร็จ — AI สร้างร่างจากข้อมูลที่กรอกแล้ว โปรดตรวจสอบก่อนนำไปใช้");
      } catch (error) {
        if (error?.name === "AbortError" || runId !== writerRun) return;
        setStatus(writerStatus, "error", `เกิดปัญหา — ${error.message} ${writerOutput.value ? "ข้อความที่เห็นเป็นร่างที่ยังไม่ครบ " : ""}ระบบไม่ได้แสดงร่างจากแม่แบบแทน`);
      } finally {
        if (runId === writerRun) setBusy(writerPanel, writerSubmit, false, "กำลังสร้างร่างด้วย AI…", "แก้ข้อมูลแล้วสร้างใหม่");
      }
    })();
  });

  editWriter.addEventListener("click", () => {
    writerOutput.readOnly = false;
    writerOutput.focus();
    setStatus(writerStatus, "success", "พร้อมแก้ไข — ข้อความที่แก้จะอยู่ในช่องร่างนี้เท่านั้น");
  });
  copyWriter.addEventListener("click", () => utils.copyText(writerOutput.value, writerOutput));
  exportWriter.addEventListener("click", () => utils.exportText("ace-message-ai.txt", writerOutput.value));
  document.getElementById("writer-reset").addEventListener("click", () => {
    if (!window.confirm("ต้องการล้างข้อมูลและร่างข้อความหรือไม่?")) return;
    writerRun += 1;
    writerController?.abort();
    setBusy(writerPanel, writerSubmit, false, "กำลังสร้างร่างด้วย AI…", "สร้างร่างด้วย AI");
    clearFieldError(document.getElementById("message-recipient"), document.getElementById("recipient-error"));
    clearFieldError(document.getElementById("message-points"), document.getElementById("points-error"));
    document.getElementById("message-type").value = "appointment";
    document.getElementById("message-recipient").value = "";
    document.getElementById("message-points").value = "";
    document.getElementById("message-tone").value = "formal";
    writerOutput.value = "";
    writerOutput.readOnly = true;
    editWriter.disabled = true;
    copyWriter.disabled = true;
    exportWriter.disabled = true;
    setStatus(writerStatus, "idle", "ก่อนเริ่ม — กรอกข้อมูลให้ครบ แล้วกดสร้างร่างด้วย AI");
  });

  function registerWebMCPTools() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    const lifecycle = new AbortController();
    window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
    const registrations = [
      {
        name: "generate_daily_plan_with_ai",
        title: "สร้างแผนงานและคำแนะนำ AI",
        description: "กรอกข้อมูลในหน้าทดลอง ACE คำนวณแผนตามกฎ และขอคำแนะนำเพิ่มเติมจาก AI โดยไม่บันทึกข้อมูลลงฐานข้อมูล",
        inputSchema: { type: "object", properties: { availableMinutes: { type: "integer", minimum: 1, maximum: 1440 }, tasks: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 160 }, duration: { type: "integer", minimum: 1, maximum: 1440 }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["name", "duration", "priority"], additionalProperties: false } } }, required: ["availableMinutes", "tasks"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          engine.buildPlan(input.availableMinutes, input.tasks);
          selectTab("planner", false);
          availableInput.value = String(input.availableMinutes);
          taskList.innerHTML = "";
          taskCounter = 0;
          input.tasks.forEach((task) => taskTemplate(task));
          plannerForm.requestSubmit();
          await lastPlannerPromise;
          return { status: plannerStatus.dataset.status, output: planText };
        }
      },
      {
        name: "generate_message_draft_with_ai",
        title: "สร้างร่างข้อความด้วย AI",
        description: "กรอกข้อมูลในหน้าทดลอง ACE และให้ AI สร้างร่างข้อความ โดยไม่ส่งข้อความให้ผู้รับ",
        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["appointment", "email", "follow-up"] }, recipient: { type: "string", minLength: 1, maxLength: 100 }, points: { type: "string", minLength: 1, maxLength: 1200 }, tone: { type: "string", enum: ["formal", "friendly", "concise"] } }, required: ["type", "recipient", "points", "tone"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          selectTab("writer", false);
          document.getElementById("message-type").value = input.type;
          document.getElementById("message-recipient").value = input.recipient;
          document.getElementById("message-points").value = input.points;
          document.getElementById("message-tone").value = input.tone;
          writerForm.requestSubmit();
          await lastWriterPromise;
          return { status: writerStatus.dataset.status, draft: writerOutput.value };
        }
      }
    ];
    registrations.forEach((tool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
      } catch (error) {
        // Unsupported registration does not affect the visible AI tools.
      }
    });
  }

  plannerSubmit.disabled = false;
  summarySubmit.disabled = false;
  writerSubmit.disabled = false;
  registerWebMCPTools();
})();
