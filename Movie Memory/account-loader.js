let accountModulePromise = null;
let accountModuleReady = false;
const isFileMode = window.location.protocol === "file:";
const authFeedback = window.MovieMemoryAuthFeedback;

function loadAccountModule() {
  if (!accountModulePromise) {
    accountModulePromise = import("./account.js?v=20260728-4")
      .then(module => {
        accountModuleReady = true;
        return module;
      })
      .catch(error => {
        accountModulePromise = null;
        authFeedback?.error();
        throw error;
      });
  }
  return accountModulePromise;
}

const loginButton = document.getElementById("googleLoginBtn");
if (!isFileMode) {
  loginButton?.addEventListener("click", async event => {
    if (accountModuleReady) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    authFeedback?.show();
    try {
      await loadAccountModule();
      loginButton.click();
    } catch (error) {
      console.error("Could not prepare Google sign-in:", error);
    }
  }, { capture: true });

  // Begin downloading account and authentication code immediately. The module
  // script is placed at the end of the page, so all required elements exist.
  loadAccountModule().catch(error => {
    console.error("Could not preload Movie Memory account features:", error);
  });
}
