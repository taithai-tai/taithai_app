(() => {
  const api = window.MovieMemoryPreferences;
  if (!api) return;

  const toast = document.getElementById('settingsToast');
  let toastTimer = null;

  function showToast(key) {
    clearTimeout(toastTimer);
    toast.textContent = api.t(key);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function sync(prefs = api.get()) {
    document.querySelectorAll('[data-setting][data-value]').forEach(button => {
      button.setAttribute('aria-pressed', String(prefs[button.dataset.setting] === button.dataset.value));
    });
    const remember = document.getElementById('rememberFiltersSwitch');
    remember.setAttribute('aria-checked', String(prefs.rememberFilters));
    api.translateDOM(document);
  }

  document.querySelectorAll('[data-setting][data-value]').forEach(button => {
    button.addEventListener('click', () => {
      const prefs = api.update({ [button.dataset.setting]: button.dataset.value });
      sync(prefs);
      showToast('settings.saved');
    });
  });

  document.getElementById('rememberFiltersSwitch').addEventListener('click', event => {
    const enabled = event.currentTarget.getAttribute('aria-checked') !== 'true';
    const prefs = api.update({ rememberFilters: enabled });
    sync(prefs);
    showToast('settings.saved');
  });

  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    localStorage.removeItem('mm_filter_settings_v1');
    showToast('settings.filtersReset');
  });

  document.getElementById('resetPreferencesBtn').addEventListener('click', () => {
    const prefs = api.reset();
    sync(prefs);
    showToast('settings.resetDone');
  });

  window.addEventListener('movie-memory:preferences', event => sync(event.detail));
  sync();
})();
