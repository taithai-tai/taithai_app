/* Shared appearance preferences for Taithai. Deliberately excludes app records and credentials. */
(function () {
  'use strict';
  if (window.TaithaiPreferences) return;

  var STORAGE_KEY = 'taithai.preferences.v1';
  var LANGUAGE_KEY = 'taithaiLang';
  var DEFAULTS = Object.freeze({
    theme: 'system', accent: 'terracotta', fontSize: 'default',
    reduceMotion: 'system', language: 'en'
  });
  var OPTIONS = Object.freeze({
    theme: ['system', 'light', 'dark'],
    accent: ['terracotta', 'blue', 'green'],
    fontSize: ['default', 'large'],
    reduceMotion: ['system', 'reduce'],
    language: ['en', 'th']
  });
  var persistent = true;
  var state;

  function copy(value) {
    return {
      theme: value.theme, accent: value.accent, fontSize: value.fontSize,
      reduceMotion: value.reduceMotion, language: value.language
    };
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validatePreferences(value, complete) {
    if (!isObject(value)) throw new TypeError('Preferences must be an object');
    var keys = Object.keys(value);
    if (complete && keys.length !== Object.keys(DEFAULTS).length) {
      throw new TypeError('The preference backup is incomplete');
    }
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(OPTIONS, key) || OPTIONS[key].indexOf(value[key]) < 0) {
        throw new TypeError('Unknown or invalid preference: ' + key);
      }
    });
    return value;
  }

  function validateBackup(input) {
    var value = typeof input === 'string' ? JSON.parse(input) : input;
    if (!isObject(value) || value.version !== 1 ||
        !Object.prototype.hasOwnProperty.call(value, 'version') ||
        Object.keys(value).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(value, 'preferences')) {
      throw new TypeError('Unsupported preference backup');
    }
    return copy(validatePreferences(value.preferences, true));
  }

  function read(key) {
    try { return window.localStorage.getItem(key); }
    catch (_) { persistent = false; return null; }
  }

  function readSaved() {
    var saved = copy(DEFAULTS);
    var raw = read(STORAGE_KEY);
    if (raw !== null) {
      try { saved = validateBackup(raw); } catch (_) { /* Ignore damaged or obsolete backups. */ }
    }
    // Existing Taithai pages already use this language key. Keep that choice authoritative.
    var language = read(LANGUAGE_KEY);
    if (OPTIONS.language.indexOf(language) >= 0) saved.language = language;
    return saved;
  }

  function query(expression) {
    try { return window.matchMedia ? window.matchMedia(expression) : null; }
    catch (_) { return null; }
  }
  var darkQuery = query('(prefers-color-scheme: dark)');
  var motionQuery = query('(prefers-reduced-motion: reduce)');

  function resolvedTheme() {
    return state.theme === 'system' ? (darkQuery && darkQuery.matches ? 'dark' : 'light') : state.theme;
  }
  function resolvedMotion() {
    return state.reduceMotion === 'reduce' || (motionQuery && motionQuery.matches) ? 'reduce' : 'default';
  }

  function apply(source, notify) {
    var root = document.documentElement;
    var theme = resolvedTheme();
    var motion = resolvedMotion();
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', state.accent);
    root.setAttribute('data-font-size', state.fontSize);
    root.setAttribute('data-motion', motion);
    root.setAttribute('lang', state.language);
    root.style.colorScheme = theme;
    if (notify) {
      window.dispatchEvent(new CustomEvent('taithai:preferences', {
        detail: {
          preferences: copy(state), resolvedTheme: theme, resolvedMotion: motion,
          source: source, persisted: persistent
        }
      }));
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, preferences: copy(state) }));
      window.localStorage.setItem(LANGUAGE_KEY, state.language);
      persistent = true;
    } catch (_) { persistent = false; }
  }

  function set(partial, source) {
    validatePreferences(partial, false);
    var next = copy(state);
    Object.keys(partial).forEach(function (key) { next[key] = partial[key]; });
    state = next;
    save();
    apply(source || 'set', true);
    return copy(state);
  }

  state = readSaved();
  window.TaithaiPreferences = Object.freeze({
    get: function () { return copy(state); },
    set: function (partial) { return set(partial, 'set'); },
    reset: function () { return set(copy(DEFAULTS), 'reset'); },
    exportData: function () { return { version: 1, preferences: copy(state) }; },
    importData: function (input) { return set(validateBackup(input), 'import'); },
    storageAvailable: function () { return persistent; }
  });
  apply('initial', false);

  function onSystemChange() { apply('system', true); }
  [darkQuery, motionQuery].forEach(function (media) {
    if (!media) return;
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  });

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) {
      if (event.newValue === null) {
        state = copy(DEFAULTS);
        var language = read(LANGUAGE_KEY);
        if (OPTIONS.language.indexOf(language) >= 0) state.language = language;
      } else {
        // Ignore an invalid cross-tab payload rather than replacing working preferences.
        try { state = validateBackup(event.newValue); } catch (_) { return; }
      }
      apply('storage', true);
    } else if (event.key === LANGUAGE_KEY) {
      var value = event.newValue;
      if (value === null) value = DEFAULTS.language;
      if (OPTIONS.language.indexOf(value) < 0) return;
      state = copy(state);
      state.language = value;
      apply('storage', true);
    } else if (event.key === null) {
      state = readSaved();
      apply('storage', true);
    }
  });
})();
