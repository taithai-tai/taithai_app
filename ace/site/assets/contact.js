(function () {
  "use strict";
  const data = window.ACE_DATA;
  const utils = window.ACE_UTILS;
  const form = document.getElementById("contact-form");
  const serviceSelect = document.getElementById("contact-service");
  const packageSelect = document.getElementById("contact-package");
  const submitButton = document.getElementById("contact-submit");
  const status = document.getElementById("contact-status");
  const preview = document.getElementById("request-preview");
  const requestText = document.getElementById("request-text");
  let summaryText = "";
  let processing = false;
  let generationRun = 0;

  data.services.forEach((service) => serviceSelect.add(new Option(service.label, service.value)));
  data.packages.forEach((item) => packageSelect.add(new Option(item.label, item.value)));

  const query = new URLSearchParams(window.location.search);
  const serviceValue = query.get("service");
  const packageValue = query.get("package");
  if (data.services.some((item) => item.value === serviceValue)) serviceSelect.value = serviceValue;
  if (data.packages.some((item) => item.value === packageValue)) packageSelect.value = packageValue;

  function setStatus(kind, message) {
    status.dataset.status = kind;
    status.querySelector("span:last-child").textContent = message;
  }

  function fieldError(input, message) {
    const error = document.getElementById(input.getAttribute("aria-describedby").split(" ").find((id) => id.endsWith("-error")));
    input.setAttribute("aria-invalid", "true");
    error.textContent = message;
    error.classList.add("show");
  }

  function clearError(input) {
    input.removeAttribute("aria-invalid");
    const description = input.getAttribute("aria-describedby") || "";
    const errorId = description.split(" ").find((id) => id.endsWith("-error"));
    if (!errorId) return;
    const error = document.getElementById(errorId);
    error.textContent = "";
    error.classList.remove("show");
  }

  function validate() {
    const name = document.getElementById("contact-name");
    const email = document.getElementById("contact-email");
    const need = document.getElementById("contact-need");
    [name, email, serviceSelect, need].forEach(clearError);
    let firstInvalid = null;
    if (!name.value.trim()) {
      fieldError(name, "กรุณากรอกชื่อที่ใช้ติดต่อ");
      firstInvalid ||= name;
    }
    const emailValue = email.value.trim();
    if (!emailValue) {
      fieldError(email, "กรุณากรอกอีเมล");
      firstInvalid ||= email;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailValue)) {
      fieldError(email, "รูปแบบอีเมลยังไม่ถูกต้อง ตัวอย่าง: name@example.com");
      firstInvalid ||= email;
    }
    if (!data.services.some((item) => item.value === serviceSelect.value)) {
      fieldError(serviceSelect, "กรุณาเลือกบริการที่สนใจ");
      firstInvalid ||= serviceSelect;
    }
    const needLength = need.value.trim().length;
    if (!needLength) {
      fieldError(need, "กรุณาเล่าเรื่องที่อยากให้ช่วย");
      firstInvalid ||= need;
    } else if (needLength < 20) {
      fieldError(need, "กรุณาเล่าเรื่องที่อยากให้ช่วยอย่างน้อย 20 ตัวอักษร");
      firstInvalid ||= need;
    }
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (processing) return;
    if (!validate()) {
      setStatus("incomplete", "ข้อมูลไม่ครบหรือไม่ถูกต้อง — โปรดตรวจช่องที่ระบุ");
      return;
    }
    processing = true;
    const runId = ++generationRun;
    submitButton.disabled = true;
    submitButton.textContent = "กำลังสร้างสรุป…";
    setStatus("loading", "กำลังจัดข้อมูลในเบราว์เซอร์… ยังไม่มีการส่งข้อมูล");
    const snapshot = {
      name: document.getElementById("contact-name").value.trim(),
      email: document.getElementById("contact-email").value.trim(),
      service: data.services.find((item) => item.value === serviceSelect.value).label,
      packageLabel: data.packages.find((item) => item.value === packageSelect.value)?.label || "ยังไม่แน่ใจ",
      need: document.getElementById("contact-need").value.trim(),
      time: document.getElementById("contact-time").value.trim() || "ไม่ได้ระบุ"
    };
    window.setTimeout(() => {
      if (runId !== generationRun) return;
      try {
        summaryText = `สรุปคำขอปรึกษา ACE — ยังไม่ได้ส่ง\n\nชื่อที่ใช้ติดต่อ: ${snapshot.name}\nอีเมล: ${snapshot.email}\nบริการที่สนใจ: ${snapshot.service}\nแพ็กเกจที่สนใจ: ${snapshot.packageLabel}\nช่วงเวลาที่สะดวก: ${snapshot.time}\n\nเรื่องที่อยากให้ช่วย\n${snapshot.need}\n\nสถานะ: สรุปนี้สร้างขึ้นภายในเบราว์เซอร์เท่านั้น ยังไม่ได้ส่งหรือบันทึกเป็นคำขอ และยังไม่มีการยืนยันวันนัดหมาย`;
        requestText.textContent = summaryText;
        preview.hidden = false;
        setStatus("success", "สร้างสรุปแล้ว — ข้อมูลยังไม่ได้ส่งหรือบันทึกเป็นคำขอ");
        preview.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      } catch (error) {
        setStatus("error", "เกิดปัญหา — ยังสร้างสรุปไม่ได้ ข้อมูลที่กรอกไว้ยังอยู่");
      } finally {
        processing = false;
        submitButton.disabled = false;
        submitButton.textContent = "สร้างสรุปคำขอ";
      }
    }, 260);
  });

  document.getElementById("copy-request").addEventListener("click", () => utils.copyText(summaryText));
  document.getElementById("export-request").addEventListener("click", () => utils.exportText("ace-consultation-summary.txt", summaryText));
  document.getElementById("contact-reset").addEventListener("click", () => {
    if (!window.confirm("ต้องการล้างข้อมูลและสรุปคำขอหรือไม่?")) return;
    generationRun += 1;
    processing = false;
    submitButton.disabled = false;
    submitButton.textContent = "สร้างสรุปคำขอ";
    form.reset();
    preview.hidden = true;
    requestText.textContent = "";
    summaryText = "";
    [document.getElementById("contact-name"), document.getElementById("contact-email"), serviceSelect, document.getElementById("contact-need")].forEach(clearError);
    setStatus("idle", "ก่อนเริ่ม — กรอกช่องที่จำเป็นให้ครบ");
  });

  submitButton.disabled = false;
})();
