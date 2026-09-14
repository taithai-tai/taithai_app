(function () {
  "use strict";

  const data = window.ACE_DATA;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedEffects = false;
  try { reducedEffects = localStorage.getItem("ace-reduce-effects") === "true"; } catch (_) { /* Session-only preference if storage is unavailable. */ }
  function applyEffects() {
    const reduced = reducedEffects || motionPreference.matches;
    document.documentElement.dataset.reduceEffects = String(reduced);
    document.querySelectorAll(".effects-toggle").forEach((button) => {
      button.setAttribute("aria-pressed", String(reduced));
      button.disabled = motionPreference.matches;
      button.textContent = motionPreference.matches ? "ลดเอฟเฟกต์ตามอุปกรณ์" : "ลดเอฟเฟกต์";
    });
  }
  applyEffects();
  motionPreference.addEventListener("change", applyEffects);

  const routes = [
    { href: "/", key: "home", label: "หน้าแรก" },
    { href: "/services/", key: "services", label: "บริการ" },
    { href: "/how-it-works/", key: "how-it-works", label: "เริ่มต้นอย่างไร" },
    { href: "/demo/", key: "demo", label: "ลองตัวอย่าง" },
    { href: "/pricing/", key: "pricing", label: "แพ็กเกจ" },
    { href: "/about/", key: "about", label: "เกี่ยวกับ" }
  ];

  function currentKey() {
    const declared = document.body && document.body.dataset.page;
    if (declared) return declared;
    const clean = window.location.pathname.replace(/\/+$/, "") || "/";
    const match = routes.find((item) => item.href.replace(/\/+$/, "") === clean);
    return match ? match.key : "";
  }

  function navLinks(className) {
    const active = currentKey();
    return routes.filter((item) => item.key !== "home").map((item) => {
      const current = item.key === active ? ' aria-current="page"' : "";
      return `<a class="${className}" href="${item.href}"${current}>${item.label}</a>`;
    }).join("");
  }

  class AceHeader extends HTMLElement {
    connectedCallback() {
      const contactCurrent = currentKey() === "contact" ? ' aria-current="page"' : "";
      this.innerHTML = `
        <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
        <header class="site-header">
          <div class="container nav-shell">
            <a class="brand" href="/" aria-label="ACE กลับหน้าแรก">
              <img class="brand-logo" src="/assets/logo.svg" alt="" width="154" height="52">
            </a>
            <nav class="desktop-nav" aria-label="เมนูหลัก">
              ${navLinks("nav-link")}
            </nav>
            <a class="button button-primary nav-cta" href="/contact/"${contactCurrent}>ขอคำปรึกษา</a>
            <button class="icon-button menu-toggle" type="button" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="mobile-navigation">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
                <path class="menu-line-one" d="M4 7h16"/>
                <path class="menu-line-two" d="M4 12h16"/>
                <path class="menu-line-three" d="M4 17h16"/>
              </svg>
            </button>
          </div>
          <nav class="mobile-nav" id="mobile-navigation" aria-label="เมนูมือถือ" aria-hidden="true">
            ${navLinks("mobile-nav-link")}
            <a class="button button-primary" href="/contact/"${contactCurrent}>ขอคำปรึกษา</a>
          </nav>
        </header>`;

      const toggle = this.querySelector(".menu-toggle");
      const menu = this.querySelector(".mobile-nav");
      const allLinks = menu.querySelectorAll("a");
      const setMenuIcon = (open) => {
        toggle.querySelector(".menu-line-one").setAttribute("d", open ? "M6 6L18 18" : "M4 7h16");
        toggle.querySelector(".menu-line-three").setAttribute("d", open ? "M6 18L18 6" : "M4 17h16");
      };
      const background = () => [document.querySelector("main"), document.querySelector("ace-footer"), this.querySelector(".brand"), this.querySelector(".nav-cta")].filter(Boolean);

      const close = (returnFocus) => {
        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "เปิดเมนู");
        setMenuIcon(false);
        document.body.classList.remove("menu-open");
        background().forEach((element) => { element.inert = false; });
        if (returnFocus) toggle.focus();
      };

      const open = () => {
        menu.classList.add("open");
        menu.setAttribute("aria-hidden", "false");
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "ปิดเมนู");
        setMenuIcon(true);
        document.body.classList.add("menu-open");
        background().forEach((element) => { element.inert = true; });
        const first = menu.querySelector("a");
        if (first) first.focus();
      };

      toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        isOpen ? close(false) : open();
      });

      allLinks.forEach((link) => link.addEventListener("click", () => close(false)));

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
          close(true);
        }
        if (event.key === "Tab" && toggle.getAttribute("aria-expanded") === "true") {
          const focusable = [toggle, ...Array.from(menu.querySelectorAll("a[href], button:not([disabled])"))];
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 980 && toggle.getAttribute("aria-expanded") === "true") {
          close(false);
        }
      });
    }
  }

  class AceFooter extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
        <footer class="site-footer">
          <div class="container footer-grid">
            <div class="footer-brand stack" style="--stack-space: 12px">
              <a class="brand" href="/" aria-label="ACE กลับหน้าแรก">
                <img class="brand-logo" src="/assets/logo.svg" alt="">
              </a>
              <p class="muted">${data.brand.tagline}</p>
              <p class="small muted">โดเมนที่เสนอ: ${data.brand.proposedDomain}<br>ยังไม่ได้ตรวจสอบความพร้อมใช้งาน และยังไม่ได้จดทะเบียน</p>
              <button class="effects-toggle" type="button" aria-pressed="false">ลดเอฟเฟกต์</button>
            </div>
            <nav class="footer-links" aria-label="ลิงก์เว็บไซต์">
              <strong>สำรวจเว็บไซต์</strong>
              <a href="/">หน้าแรก</a>
              <a href="/services/">บริการ</a>
              <a href="/how-it-works/">ขั้นตอนเริ่มต้น</a>
              <a href="/demo/">ลองตัวอย่าง</a>
              <a href="/pricing/">แพ็กเกจ</a>
            </nav>
            <nav class="footer-links" aria-label="ลิงก์ข้อมูลเพิ่มเติม">
              <strong>เกี่ยวกับโครงงาน</strong>
              <a href="/about/">เกี่ยวกับ ACE</a>
              <a href="/contact/">ขอคำปรึกษา</a>
              <a href="/privacy/">การจัดการข้อมูล</a>
              <a href="/thank-you/">สถานะระบบรับคำขอ</a>
            </nav>
          </div>
          <div class="container education-note">
            <strong>${data.education.th}</strong><br>
            <span lang="en">${data.education.en}</span>
          </div>
        </footer>`;
      this.querySelector(".effects-toggle").addEventListener("click", () => {
        reducedEffects = !reducedEffects;
        try { localStorage.setItem("ace-reduce-effects", String(reducedEffects)); } catch (_) { /* Do not block the preference. */ }
        applyEffects();
      });
      applyEffects();
    }
  }

  if (!customElements.get("ace-header")) customElements.define("ace-header", AceHeader);
  if (!customElements.get("ace-footer")) customElements.define("ace-footer", AceFooter);

  let toastTimer;
  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function copyText(text, selectableElement) {
    if (!text) {
      showToast("ยังไม่มีข้อความให้คัดลอก");
      return false;
    }
    try {
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }
      if (!copied) {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const legacyCopied = document.execCommand("copy");
        helper.remove();
        if (!legacyCopied) throw new Error("copy command unavailable");
      }
      showToast("คัดลอกข้อความแล้ว");
      return true;
    } catch (error) {
      if (selectableElement && typeof selectableElement.select === "function") {
        selectableElement.focus();
        selectableElement.select();
      } else if (selectableElement) {
        const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
        const range = document.createRange();
        range.selectNodeContents(selectableElement);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (typeof selectableElement.focus === "function") selectableElement.focus();
      }
      showToast("คัดลอกอัตโนมัติไม่ได้ โปรดเลือกข้อความแล้วคัดลอกเอง");
      return false;
    }
  }

  function exportText(filename, text) {
    if (!text) {
      showToast("ยังไม่มีข้อความให้ส่งออก");
      return false;
    }
    try {
      const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("เริ่มดาวน์โหลดไฟล์ข้อความแล้ว");
      return true;
    } catch (error) {
      showToast("ยังส่งออกไฟล์ไม่ได้ โปรดลองคัดลอกข้อความแทน");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMinutes(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return "0 นาที";
    const hours = Math.floor(value / 60);
    const mins = Math.round(value % 60);
    if (hours && mins) return `${hours} ชม. ${mins} นาที`;
    if (hours) return `${hours} ชม.`;
    return `${mins} นาที`;
  }

  function serviceIcon(value) {
    if (value === "life-planner") return '<svg viewBox="0 0 24 24"><path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="m8 14 2 2 5-5"/></svg>';
    if (value === "organizer") return '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
    return '<svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3M5.5 16.5l3 3"/></svg>';
  }

  function servicePreview(service) {
    const preview = data.previews[service.value];
    if (!preview) return "";
    const content = preview.rows
      ? `<ul class="preview-lines">${preview.rows.map((row) => `<li><strong>${escapeHTML(row[0])}</strong><span>${escapeHTML(row[1])}</span></li>`).join("")}</ul>`
      : `<p class="preview-quote">${escapeHTML(preview.text)}</p>`;
    return `<div class="service-preview"><span class="demo-label">ตัวอย่างการใช้งาน · ข้อมูลสมมติ</span>${content}<p class="preview-note">${escapeHTML(preview.note)}</p></div>`;
  }

  function renderServiceCards(target) {
    target.innerHTML = data.services.map((service) => `
      <article class="card">
        <div class="card-icon" aria-hidden="true">${serviceIcon(service.value)}</div>
        <p class="kicker">${escapeHTML(service.name)}</p>
        <h3>${escapeHTML(service.title)}</h3>
        <p>${escapeHTML(service.short)}</p>
        ${servicePreview(service)}
        <div class="card-actions"><a class="text-link" href="/services/#${encodeURIComponent(service.value)}">ดูรายละเอียด</a><a class="text-link" href="/demo/?mode=${encodeURIComponent(service.demoMode)}">${escapeHTML(service.demoCta)}</a></div>
      </article>`).join("");
  }

  function renderServiceDetails(target) {
    const codes = ["01", "02", "03"];
    target.innerHTML = data.services.map((service, index) => `
      <section class="service-detail" id="${escapeHTML(service.value)}" aria-labelledby="${escapeHTML(service.value)}-title">
        <div class="service-sticky"><span class="service-code" aria-hidden="true">${codes[index] || index + 1}</span><p class="kicker">${escapeHTML(service.name)}</p><h2 id="${escapeHTML(service.value)}-title">${escapeHTML(service.title)}</h2><p class="muted">${escapeHTML(service.short)}</p>${servicePreview(service)}</div>
        <div class="stack" style="--stack-space: 22px">
          <div class="detail-grid">
            <article class="detail-block"><h3>เหมาะกับใคร</h3><p>${escapeHTML(service.idealFor)}</p></article>
            <article class="detail-block"><h3>ช่วยเรื่องอะไร</h3><p>${escapeHTML(service.helps)}</p></article>
            <article class="detail-block"><h3>สิ่งที่ได้รับ</h3><p>${escapeHTML(service.deliverables)}</p></article>
            <article class="detail-block"><h3>ตัวอย่างการใช้งาน</h3><p>${escapeHTML(service.example)}</p></article>
          </div>
          <div class="detail-block limit"><h3>ข้อจำกัดที่ควรรู้</h3><p>${escapeHTML(service.limitation)}</p></div>
          <div class="button-row"><a class="button button-primary" href="/contact/?service=${encodeURIComponent(service.value)}">ขอคำปรึกษา</a><a class="button button-secondary" href="/demo/?mode=${encodeURIComponent(service.demoMode)}">${escapeHTML(service.demoCta)}</a></div>
        </div>
      </section>`).join("");
  }

  function renderPricingCards(target) {
    target.innerHTML = data.packages.map((item) => `
      <article class="card price-card">
        <p class="kicker">${escapeHTML(item.name)}</p><h3>${escapeHTML(item.title)}</h3>
        <p class="price">${escapeHTML(item.price)}</p><p class="price-note">${escapeHTML(item.priceNote)}</p>
        <ul class="check-list">${item.features.map((feature) => `<li>${escapeHTML(feature)}</li>`).join("")}</ul>
        <a class="button ${item.primary ? "button-primary" : "button-secondary"}" href="/contact/?package=${encodeURIComponent(item.value)}">ปรึกษาแพ็กเกจนี้</a>
      </article>`).join("");
  }

  function renderPricingTable(target) {
    target.innerHTML = `<table class="comparison-table" role="table"><thead><tr><th scope="col">รายการ</th>${data.packages.map((item) => `<th scope="col">${escapeHTML(item.name)}</th>`).join("")}</tr></thead><tbody>${data.pricingRows.map((row) => `<tr><th scope="row">${escapeHTML(row.label)}</th>${row.values.map((value, index) => `<td data-label="${escapeHTML(data.packages[index].name)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function renderFaq(target) {
    target.innerHTML = data.faq.map((item) => `<details><summary>${escapeHTML(item.question)}</summary><div class="faq-answer">${escapeHTML(item.answer)}</div></details>`).join("");
  }

  function renderManagedContent() {
    document.querySelectorAll("[data-render]").forEach((target) => {
      const renderer = target.dataset.render;
      if (renderer === "service-cards" && Array.isArray(data.services)) renderServiceCards(target);
      if (renderer === "service-details" && Array.isArray(data.services)) renderServiceDetails(target);
      if (renderer === "pricing-cards" && Array.isArray(data.packages)) renderPricingCards(target);
      if (renderer === "pricing-table" && Array.isArray(data.pricingRows)) renderPricingTable(target);
      if (renderer === "faq" && Array.isArray(data.faq)) renderFaq(target);
    });
    if (window.location.hash) {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(window.location.hash.slice(1));
        if (target) target.scrollIntoView({ block: "start" });
      });
    }
  }

  window.ACE_UTILS = Object.freeze({ showToast, copyText, exportText, escapeHTML, formatMinutes });
  renderManagedContent();
})();
