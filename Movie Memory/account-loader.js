let accountModulePromise = null;
let accountModuleReady = false;

function loadAccountModule() {
  if (!accountModulePromise) {
    accountModulePromise = import("./account.js?v=20260728-3").then(module => {
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadAccountModule, { once: true });
} else {
  loadAccountModule();
}
