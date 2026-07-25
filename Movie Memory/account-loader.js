let accountModulePromise = null;
let accountModuleReady = false;

function loadAccountModule() {
  if (!accountModulePromise) {
    accountModulePromise = import("./account.js?v=20260725-9").then(module => {
      accountModuleReady = true;
      return module;
    });
  }
  return accountModulePromise;
}

const loginButton = document.getElementById("googleLoginBtn");
loginButton?.addEventListener("click", async event => {
  if (accountModuleReady) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await loadAccountModule();
  loginButton.click();
}, { capture: true });

const scheduleAccountLoad = () => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(loadAccountModule, { timeout: 1200 });
  } else {
    window.setTimeout(loadAccountModule, 300);
  }
};

if (document.readyState === "complete") {
  scheduleAccountLoad();
} else {
  window.addEventListener("load", scheduleAccountLoad, { once: true });
}
