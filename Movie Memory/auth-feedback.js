(() => {
  const LOGIN_SELECTORS = "#googleLoginBtn, #dashboardLoginBtn, #loginBtn, #guestLoginBtn";
  let overlay = null;
  let slowTimer = 0;
  let hideTimer = 0;

  const COPY = {
    th: {
      openingTitle: "กำลังเข้าสู่ระบบด้วย Google",
      openingCopy: "กำลังเปิดหน้าต่างเลือกบัญชี โปรดรอสักครู่…",
      finishingTitle: "เข้าสู่ระบบสำเร็จ",
      finishingCopy: "กำลังพาคุณกลับไปยัง Movie Memory…",
      errorTitle: "เปิดหน้าต่าง Google ไม่สำเร็จ",
      errorCopy: "กรุณาลองอีกครั้ง และตรวจว่าบราวเซอร์อนุญาตป๊อปอัปจากเว็บไซต์นี้",
      slowCopy: "ยังทำงานอยู่ หากไม่เห็นหน้าต่าง Google โปรดตรวจว่าบราวเซอร์บล็อกป๊อปอัปหรือไม่",
      hide: "ซ่อนหน้าต่างนี้",
      close: "ปิด",
      stepConnect: "เชื่อมต่อ",
      stepChoose: "เลือกบัญชี",
      stepReturn: "กลับสู่แอป"
    },
    en: {
      openingTitle: "Signing in with Google",
      openingCopy: "Opening the account chooser. This may take a moment…",
      finishingTitle: "You’re signed in",
      finishingCopy: "Taking you back to Movie Memory…",
      errorTitle: "Couldn’t open Google sign-in",
      errorCopy: "Please try again and make sure this site is allowed to open pop-ups.",
      slowCopy: "Still working. If Google has not appeared, check whether your browser blocked the pop-up.",
      hide: "Hide this screen",
      close: "Close",
      stepConnect: "Connect",
      stepChoose: "Choose account",
      stepReturn: "Return to app"
    }
  };

  function language() {
    return window.MovieMemoryPreferences?.get?.().language === "en" ? "en" : "th";
  }

  function copy() {
    return COPY[language()];
  }

  function assetBase() {
    return window.location.protocol === "file:" ? "./" : "/movie-memory-assets/";
  }

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "mm-auth-feedback";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "mmAuthFeedbackTitle");
    overlay.innerHTML = `
      <div class="mm-auth-feedback-card">
        <div class="mm-auth-feedback-brand" aria-hidden="true">
          <img src="${assetBase()}feature-icons/brand.jpg?v=20260728-1" alt="">
          <span class="mm-auth-google-mark">
            <svg viewBox="0 0 24 24">
              <path fill="#4285f4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.9a5.1 5.1 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.2Z"/>
              <path fill="#34a853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z"/>
              <path fill="#fbbc05" d="M5.8 14.1a6.5 6.5 0 0 1 0-4.2V7.1H2.2A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 5l3.6-2.9Z"/>
              <path fill="#ea4335" d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.7 10.7 0 0 0 12 1a11 11 0 0 0-9.8 6.1l3.6 2.8c.9-2.6 3.3-4.5 6.2-4.5Z"/>
            </svg>
          </span>
        </div>
        <div class="mm-auth-spinner" aria-hidden="true"><i></i></div>
        <h2 id="mmAuthFeedbackTitle"></h2>
        <p class="mm-auth-feedback-copy"></p>
        <div class="mm-auth-progress" aria-hidden="true">
          <span class="is-active"><i></i><small></small></span>
          <span><i></i><small></small></span>
          <span><i></i><small></small></span>
        </div>
        <p class="mm-auth-slow-note" hidden></p>
        <button class="mm-auth-feedback-close" type="button" hidden></button>
      </div>`;
    document.body.append(overlay);
    overlay.querySelector(".mm-auth-feedback-close").addEventListener("click", hide);
    return overlay;
  }

  function updateCopy(stage = "opening") {
    const text = copy();
    const title = overlay.querySelector("#mmAuthFeedbackTitle");
    const description = overlay.querySelector(".mm-auth-feedback-copy");
    const steps = overlay.querySelectorAll(".mm-auth-progress small");
    const closeButton = overlay.querySelector(".mm-auth-feedback-close");
    steps[0].textContent = text.stepConnect;
    steps[1].textContent = text.stepChoose;
    steps[2].textContent = text.stepReturn;
    closeButton.textContent = stage === "error" ? text.close : text.hide;
    if (stage === "finishing") {
      title.textContent = text.finishingTitle;
      description.textContent = text.finishingCopy;
    } else if (stage === "error") {
      title.textContent = text.errorTitle;
      description.textContent = text.errorCopy;
    } else {
      title.textContent = text.openingTitle;
      description.textContent = text.openingCopy;
    }
  }

  function setStage(stage = "opening") {
    createOverlay();
    overlay.dataset.stage = stage;
    overlay.classList.toggle("is-error", stage === "error");
    updateCopy(stage);
    const steps = overlay.querySelectorAll(".mm-auth-progress > span");
    steps.forEach((step, index) => {
      const activeThrough = stage === "finishing" ? 2 : stage === "error" ? 0 : 1;
      step.classList.toggle("is-active", index <= activeThrough);
    });
    if (stage === "finishing") {
      window.clearTimeout(slowTimer);
      overlay.querySelector(".mm-auth-slow-note").hidden = true;
      overlay.querySelector(".mm-auth-feedback-close").hidden = true;
    }
  }

  function show() {
    createOverlay();
    window.clearTimeout(hideTimer);
    window.clearTimeout(slowTimer);
    overlay.classList.remove("is-leaving", "is-slow", "is-error");
    overlay.hidden = false;
    document.body.classList.add("mm-auth-waiting");
    setStage("opening");
    overlay.querySelector(".mm-auth-slow-note").hidden = true;
    overlay.querySelector(".mm-auth-feedback-close").hidden = true;
    slowTimer = window.setTimeout(() => {
      if (!overlay || overlay.hidden) return;
      const text = copy();
      overlay.classList.add("is-slow");
      overlay.querySelector(".mm-auth-slow-note").textContent = text.slowCopy;
      overlay.querySelector(".mm-auth-slow-note").hidden = false;
      overlay.querySelector(".mm-auth-feedback-close").hidden = false;
    }, 6500);
  }

  function hide() {
    if (!overlay || overlay.hidden) return;
    window.clearTimeout(slowTimer);
    overlay.classList.add("is-leaving");
    document.body.classList.remove("mm-auth-waiting");
    hideTimer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("is-leaving", "is-slow", "is-error");
    }, 180);
  }

  function error(message) {
    createOverlay();
    window.clearTimeout(slowTimer);
    overlay.hidden = false;
    document.body.classList.add("mm-auth-waiting");
    setStage("error");
    if (message) overlay.querySelector(".mm-auth-feedback-copy").textContent = message;
    overlay.querySelector(".mm-auth-slow-note").hidden = true;
    overlay.querySelector(".mm-auth-feedback-close").hidden = false;
  }

  window.MovieMemoryAuthFeedback = { show, hide, error, setStage };

  document.addEventListener("click", event => {
    const button = event.target.closest?.(LOGIN_SELECTORS);
    if (button && !button.disabled && !button.hidden) show();
  }, { capture: true });
})();
