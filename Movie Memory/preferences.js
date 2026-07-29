(() => {
  const STORAGE_KEY = 'mm_app_preferences_v1';
  const DEFAULTS = Object.freeze({
    language: 'th',
    font: 'system',
    accent: 'gold',
    density: 'comfortable',
    motion: 'system',
    defaultView: 'grid',
    rememberFilters: true
  });

  const ALLOWED = {
    language: ['th', 'en'],
    font: ['system', 'noto', 'modern'],
    accent: ['gold', 'rose', 'blue'],
    density: ['comfortable', 'compact'],
    motion: ['system', 'full', 'reduced'],
    defaultView: ['grid', 'list', 'ticket']
  };

  const FONT_STACKS = {
    system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Noto Sans Thai", sans-serif',
    noto: '"Noto Sans Thai", -apple-system, BlinkMacSystemFont, sans-serif',
    modern: '"DM Sans", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, sans-serif'
  };

  const ACCENTS = {
    gold: { main: '#ff9f0a', light: '#ffd60a', secondary: '#ff7a00' },
    rose: { main: '#ff375f', light: '#ff6482', secondary: '#bf5af2' },
    blue: { main: '#0a84ff', light: '#64d2ff', secondary: '#5e5ce6' }
  };

  const COPY = {
    th: {
      'home.login': 'ล็อกอิน',
      'home.add': '✨ ＋ เพิ่มบันทึกหนัง',
      'home.eyebrow': '🎬 PERSONAL CINEMA VAULT',
      'home.title': 'ทุกเรื่องที่ดู<br>คือหนึ่ง<em>ความทรงจำ</em>',
      'home.intro': 'บันทึกตั๋วหนัง ความรู้สึก และบรรยากาศในวันนั้นไว้ในคอลเลกชันส่วนตัวเพื่อย้อนเวลาดูได้ทุกเมื่อ',
      'feature.game.title': 'เกมเลือกหนัง',
      'feature.game.copy': 'เลือกซ้าย–ขวา หาหนังอันดับหนึ่ง',
      'feature.recommendations.title': 'แนะนำหนัง',
      'feature.recommendations.copy': 'คัดเรื่องที่คุณน่าจะชอบ',
      'feature.install.title': 'เพิ่มไอคอนแอป',
      'feature.install.copy': 'วิธีติดไว้บนหน้าจอโทรศัพท์',
      'feature.dashboard.title': 'Dashboard',
      'feature.dashboard.copy': 'ดูสถิติการชมทั้งหมดของคุณ',
      'feature.tutorial.title': 'วิธีใช้งาน',
      'feature.tutorial.copy': 'เรียนรู้การบันทึกหนังแบบรวดเร็ว',
      'feature.settings.title': 'Settings',
      'feature.settings.copy': 'ภาษา ฟอนต์ และรูปแบบของแอป',
      'feature.scroll.prev': 'เลื่อนเมนูไปทางซ้าย',
      'feature.scroll.next': 'เลื่อนเมนูไปทางขวา',
      'watch.title': 'รับชมได้ที่ไหน',
      'watch.subtitle': 'ช่องทางออนไลน์ที่มีข้อมูลในประเทศไทย',
      'watch.loading': 'กำลังค้นหาช่องทางรับชม…',
      'watch.noInfo': 'ยังไม่พบช่องทางรับชมออนไลน์ในประเทศไทย',
      'watch.error': 'ค้นหาช่องทางรับชมไม่สำเร็จ',
      'watch.retry': 'ลองอีกครั้ง',
      'watch.all': 'ดูตัวเลือกทั้งหมด ↗',
      'watch.source': 'ข้อมูลผู้ให้บริการโดย JustWatch ผ่าน TMDB',
      'watch.category.stream': 'สตรีมมิง',
      'watch.category.free': 'ดูฟรี',
      'watch.category.ads': 'ดูฟรีพร้อมโฆษณา',
      'watch.category.rent': 'เช่า',
      'watch.category.buy': 'ซื้อ',
      'home.quote': '“หนังจบลง... แต่ความรู้สึกและตั๋วใบนั้นจะคงอยู่ตลอดไป”',
      'home.quote.by': '— บันทึกการชมภาพยนตร์ของคุณ',
      'home.search.placeholder': 'ค้นหาชื่อหนัง, โรงภาพยนตร์, ที่นั่ง หรือความรู้สึก...',
      'home.people.placeholder': 'ค้นหาไอดี...',
      'home.filter': 'ตัวกรอง',
      'home.allYears': 'ทุกปี',
      'home.allFormats': 'ทุกรูปแบบ',
      'home.sort.newest': 'ดูล่าสุดก่อน',
      'home.sort.oldest': 'เก่าสุดก่อน',
      'home.sort.releaseNewest': 'ปีฉายใหม่ → เก่า',
      'home.sort.releaseOldest': 'ปีฉายเก่า → ใหม่',
      'home.sort.rating': 'คะแนนสูงสุด',
      'home.sort.title': 'ชื่อ A–Z',
      'home.view.grid': '▦ โปสเตอร์',
      'home.view.list': '☷ รายการ',
      'home.view.ticket': '🎟️ ตั๋ว',
      'home.collection': 'คอลเลกชันของฉัน',
      'home.collection.empty': 'ยังไม่มีหนังในคอลเลกชัน',
      'home.resetFilters': '↻ รีเซ็ตตัวกรอง',
      'home.mobileAdd': 'เพิ่มหนัง',
      'collection.filterCount': 'ตัวกรอง · {count}',
      'collection.found': 'พบ {shown} จาก {total} เรื่อง',
      'collection.saved': '{total} เรื่อง · เก็บไว้เป็นความทรงจำแล้ว',
      'collection.none': 'ยังไม่มีหนังในคอลเลกชัน',
      'collection.empty.title': 'ยังไม่มีความทรงจำภาพยนตร์',
      'collection.empty.copy': 'เริ่มบันทึกหนังเรื่องแรก แล้วค่อย ๆ สร้างคอลเลกชันความทรงจำของคุณ',
      'collection.empty.add': '✨ ＋ เพิ่มหนังเรื่องแรก',
      'collection.search.none': 'ไม่พบหนังที่ค้นหา',
      'collection.search.copy': 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูหนังทั้งหมด',
      'collection.search.clear': 'ล้างตัวกรอง',
      'date.unspecified': 'ไม่ระบุวันที่',
      'settings.kicker': '⚙ PERSONALIZE',
      'settings.title': 'ตั้งค่า Movie Memory<br>ให้เป็นแบบ<em>ของคุณ</em>',
      'settings.intro': 'ปรับภาษา ตัวอักษร สี การแสดงคอลเลกชัน และการเคลื่อนไหว ค่าที่เลือกจะถูกจำไว้ในอุปกรณ์นี้',
      'settings.language.title': 'ภาษา',
      'settings.language.copy': 'เปลี่ยนภาษาของเมนูหลักและหน้าตั้งค่า',
      'settings.thai': 'ไทย',
      'settings.english': 'English',
      'settings.font.title': 'ฟอนต์',
      'settings.font.copy': 'เลือกบุคลิกตัวอักษรที่อ่านสบายสำหรับคุณ',
      'settings.font.system': 'System',
      'settings.font.system.copy': 'ใช้ฟอนต์มาตรฐานของอุปกรณ์',
      'settings.font.noto': 'Noto Sans Thai',
      'settings.font.noto.copy': 'อ่านภาษาไทยชัดและเป็นกลาง',
      'settings.font.modern': 'Modern',
      'settings.font.modern.copy': 'รูปทรงร่วมสมัยและกระชับ',
      'settings.accent.title': 'สีเน้น',
      'settings.accent.copy': 'เปลี่ยนสีของปุ่ม ลิงก์ ดาว และจุดสำคัญ',
      'settings.accent.gold': 'Cinema Gold',
      'settings.accent.rose': 'Rose',
      'settings.accent.blue': 'Electric Blue',
      'settings.collection.title': 'คอลเลกชัน',
      'settings.collection.copy': 'กำหนดหน้าตาเริ่มต้นเมื่อเปิดแอป',
      'settings.view.title': 'รูปแบบเริ่มต้น',
      'settings.view.grid': 'โปสเตอร์',
      'settings.view.list': 'รายการ',
      'settings.view.ticket': 'ตั๋วหนัง',
      'settings.density.title': 'ระยะห่าง',
      'settings.density.comfortable': 'สบายตา',
      'settings.density.compact': 'กระชับ',
      'settings.remember.title': 'จำตัวกรองล่าสุด',
      'settings.remember.copy': 'เก็บคำค้นหา การเรียง และตัวกรองไว้เมื่อกลับมาใหม่',
      'settings.motion.title': 'การเคลื่อนไหว',
      'settings.motion.copy': 'ปรับแอนิเมชันให้เหมาะกับการใช้งาน',
      'settings.motion.system': 'ตามอุปกรณ์',
      'settings.motion.full': 'เต็มรูปแบบ',
      'settings.motion.reduced': 'ลดการเคลื่อนไหว',
      'settings.account.title': 'บัญชีและข้อมูล',
      'settings.account.copy': 'จัดการไอดีโปรไฟล์และล้างค่าที่บันทึกไว้',
      'settings.account.button': 'จัดการไอดีโปรไฟล์',
      'settings.filters.reset': 'ล้างตัวกรองที่จำไว้',
      'settings.reset': 'คืนค่าการตั้งค่าทั้งหมด',
      'settings.back': '← กลับคอลเลกชัน',
      'settings.preview.label': 'ตัวอย่าง',
      'settings.preview.title': 'Your Movie Memory',
      'settings.preview.copy': 'ทุกเรื่องที่ดู คือหนึ่งความทรงจำ',
      'settings.saved': 'บันทึกการตั้งค่าแล้ว',
      'settings.resetDone': 'คืนค่าการตั้งค่าแล้ว',
      'settings.filtersReset': 'ล้างตัวกรองแล้ว'
    },
    en: {
      'home.login': 'Login',
      'home.add': '✨ + Add movie',
      'home.eyebrow': '🎬 PERSONAL CINEMA VAULT',
      'home.title': 'Every movie you watch<br>becomes a <em>memory</em>',
      'home.intro': 'Save the ticket, feeling, and atmosphere of each movie day in a personal collection you can revisit anytime.',
      'feature.game.title': 'Movie Match',
      'feature.game.copy': 'Choose left or right to find your favorite',
      'feature.recommendations.title': 'For You',
      'feature.recommendations.copy': 'Movies picked for your taste',
      'feature.install.title': 'Add App Icon',
      'feature.install.copy': 'Keep Movie Memory on your Home Screen',
      'feature.dashboard.title': 'Dashboard',
      'feature.dashboard.copy': 'See all of your viewing statistics',
      'feature.tutorial.title': 'How to Use',
      'feature.tutorial.copy': 'Learn the essentials in a few steps',
      'feature.settings.title': 'Settings',
      'feature.settings.copy': 'Language, font, and app preferences',
      'feature.scroll.prev': 'Scroll menu left',
      'feature.scroll.next': 'Scroll menu right',
      'watch.title': 'Where to watch',
      'watch.subtitle': 'Online availability reported for Thailand',
      'watch.loading': 'Finding watch options…',
      'watch.noInfo': 'No online watch options are currently listed for Thailand',
      'watch.error': 'Could not load watch options',
      'watch.retry': 'Try again',
      'watch.all': 'See all options ↗',
      'watch.source': 'Provider data by JustWatch via TMDB',
      'watch.category.stream': 'Stream',
      'watch.category.free': 'Free',
      'watch.category.ads': 'Free with ads',
      'watch.category.rent': 'Rent',
      'watch.category.buy': 'Buy',
      'home.quote': '“The movie ends, but the feeling and that ticket stay with you.”',
      'home.quote.by': '— Your personal cinema journal',
      'home.search.placeholder': 'Search movies, cinemas, seats, or memories...',
      'home.people.placeholder': 'Search account ID...',
      'home.filter': 'Filters',
      'home.allYears': 'All years',
      'home.allFormats': 'All formats',
      'home.sort.newest': 'Recently watched',
      'home.sort.oldest': 'Oldest watched',
      'home.sort.releaseNewest': 'Release year: new → old',
      'home.sort.releaseOldest': 'Release year: old → new',
      'home.sort.rating': 'Highest rated',
      'home.sort.title': 'Title A–Z',
      'home.view.grid': '▦ Posters',
      'home.view.list': '☷ List',
      'home.view.ticket': '🎟️ Tickets',
      'home.collection': 'My Collection',
      'home.collection.empty': 'No movies in your collection yet',
      'home.resetFilters': '↻ Reset filters',
      'home.mobileAdd': 'Add movie',
      'collection.filterCount': 'Filters · {count}',
      'collection.found': 'Showing {shown} of {total} movies',
      'collection.saved': '{total} movies saved as memories',
      'collection.none': 'No movies in your collection yet',
      'collection.empty.title': 'No movie memories yet',
      'collection.empty.copy': 'Start with your first movie and build your personal collection one memory at a time.',
      'collection.empty.add': '✨ + Add your first movie',
      'collection.search.none': 'No matching movies found',
      'collection.search.copy': 'Try another search or clear your filters to see the full collection.',
      'collection.search.clear': 'Clear filters',
      'date.unspecified': 'Date not specified',
      'settings.kicker': '⚙ PERSONALIZE',
      'settings.title': 'Make Movie Memory<br>feel like <em>yours</em>',
      'settings.intro': 'Adjust language, typography, color, collection layout, and motion. Your choices are remembered on this device.',
      'settings.language.title': 'Language',
      'settings.language.copy': 'Change the language of the main menus and Settings',
      'settings.thai': 'ไทย',
      'settings.english': 'English',
      'settings.font.title': 'Font',
      'settings.font.copy': 'Choose the type style that feels most comfortable',
      'settings.font.system': 'System',
      'settings.font.system.copy': 'Use your device’s default typeface',
      'settings.font.noto': 'Noto Sans Thai',
      'settings.font.noto.copy': 'Clear, neutral Thai typography',
      'settings.font.modern': 'Modern',
      'settings.font.modern.copy': 'A compact contemporary style',
      'settings.accent.title': 'Accent color',
      'settings.accent.copy': 'Change buttons, links, stars, and highlights',
      'settings.accent.gold': 'Cinema Gold',
      'settings.accent.rose': 'Rose',
      'settings.accent.blue': 'Electric Blue',
      'settings.collection.title': 'Collection',
      'settings.collection.copy': 'Choose how the app looks when it opens',
      'settings.view.title': 'Default view',
      'settings.view.grid': 'Posters',
      'settings.view.list': 'List',
      'settings.view.ticket': 'Tickets',
      'settings.density.title': 'Spacing',
      'settings.density.comfortable': 'Comfortable',
      'settings.density.compact': 'Compact',
      'settings.remember.title': 'Remember recent filters',
      'settings.remember.copy': 'Keep search, sorting, and filters for your next visit',
      'settings.motion.title': 'Motion',
      'settings.motion.copy': 'Adjust animation to suit your preference',
      'settings.motion.system': 'Use device setting',
      'settings.motion.full': 'Full motion',
      'settings.motion.reduced': 'Reduce motion',
      'settings.account.title': 'Account & data',
      'settings.account.copy': 'Manage your profile ID and locally saved preferences',
      'settings.account.button': 'Manage profile ID',
      'settings.filters.reset': 'Clear remembered filters',
      'settings.reset': 'Reset all preferences',
      'settings.back': '← Back to collection',
      'settings.preview.label': 'Preview',
      'settings.preview.title': 'Your Movie Memory',
      'settings.preview.copy': 'Every movie you watch becomes a memory',
      'settings.saved': 'Settings saved',
      'settings.resetDone': 'Preferences reset',
      'settings.filtersReset': 'Remembered filters cleared'
    }
  };

  function normalize(value = {}) {
    const next = { ...DEFAULTS };
    for (const [key, values] of Object.entries(ALLOWED)) {
      if (values.includes(value[key])) next[key] = value[key];
    }
    if (typeof value.rememberFilters === 'boolean') next.rememberFilters = value.rememberFilters;
    return next;
  }

  function get() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch {
      return { ...DEFAULTS };
    }
  }

  function t(key, variables = {}, language = get().language) {
    const template = COPY[language]?.[key] || COPY.th[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? '');
  }

  function translateDOM(root = document) {
    const language = get().language;
    root.querySelectorAll('[data-mm-i18n]').forEach(element => {
      element.textContent = t(element.dataset.mmI18n, {}, language);
    });
    root.querySelectorAll('[data-mm-i18n-html]').forEach(element => {
      element.innerHTML = t(element.dataset.mmI18nHtml, {}, language);
    });
    root.querySelectorAll('[data-mm-i18n-placeholder]').forEach(element => {
      element.placeholder = t(element.dataset.mmI18nPlaceholder, {}, language);
    });
    root.querySelectorAll('[data-mm-i18n-aria-label]').forEach(element => {
      element.setAttribute('aria-label', t(element.dataset.mmI18nAriaLabel, {}, language));
    });
  }

  function apply(value = get()) {
    const prefs = normalize(value);
    const root = document.documentElement;
    const accent = ACCENTS[prefs.accent];
    root.lang = prefs.language;
    root.dataset.mmLanguage = prefs.language;
    root.dataset.mmFont = prefs.font;
    root.dataset.mmAccent = prefs.accent;
    root.dataset.mmDensity = prefs.density;
    root.dataset.mmMotion = prefs.motion;
    root.style.setProperty('--mm-font-family', FONT_STACKS[prefs.font]);
    root.style.setProperty('--gold', accent.main);
    root.style.setProperty('--gold-light', accent.light);
    root.style.setProperty('--orange', accent.secondary);
    root.style.setProperty('--border-gold', `${accent.main}55`);
    root.style.setProperty('--shadow-gold', `0 12px 32px ${accent.main}26`);
    localStorage.setItem('mm_view_mode', prefs.defaultView);
    if (!prefs.rememberFilters) localStorage.removeItem('mm_filter_settings_v1');
    if (document.readyState !== 'loading') translateDOM(document);
    return prefs;
  }

  function update(changes) {
    const next = normalize({ ...get(), ...changes });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    apply(next);
    window.dispatchEvent(new CustomEvent('movie-memory:preferences', { detail: next }));
    return next;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem('mm_view_mode', DEFAULTS.defaultView);
    apply(DEFAULTS);
    window.dispatchEvent(new CustomEvent('movie-memory:preferences', { detail: { ...DEFAULTS } }));
    return { ...DEFAULTS };
  }

  window.MovieMemoryPreferences = {
    defaults: DEFAULTS,
    get,
    update,
    reset,
    apply,
    t,
    translateDOM
  };

  apply();
  document.addEventListener('DOMContentLoaded', () => translateDOM(document), { once: true });
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) apply();
  });
})();
