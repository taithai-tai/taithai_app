    const STORAGE_KEY = 'taithai_movie_memory_v2';
    const FILTER_STORAGE_KEY = 'mm_filter_settings_v1';
    const API_KEY = 'a7ee9f0641a8225ed2d6f0693de8507d';
    const BASE_URL = 'https://api.themoviedb.org/3';
    const IMG_URL = 'https://image.tmdb.org/t/p/w500';

    const $ = id => document.getElementById(id);

    let movies = loadMoviesFromStorage();
    let currentViewMode = localStorage.getItem('mm_view_mode') || 'grid';
    let catalogMoviesList = [];
    let catalogPage = 1;
    let catalogQuery = '';
    let isCatalogLoading = false;
    let tmdbDebounceTimer = null;
    let inspectingMovieId = null;
    let posterChoices = [];
    let pendingDeleteMovieId = null;
    let pendingDeleteTimer = null;
    let storyEditorState = {
      movie: null,
      shareDetails: null,
      averageColor: '#1d110a',
      backgroundColor: '#1d110a',
      previewBlob: null,
      previewUrl: '',
      renderTimer: null,
      renderVersion: 0
    };
    const IS_FILE_MODE = window.location.protocol === 'file:';
    const APP_HOME = IS_FILE_MODE ? './index.html' : '/Movie%20Memory/';
    const APP_ROUTES = '/Movie-Memory';
    const currentRoute = () => {
      const path = window.location.pathname.replace(/\/+$/, '');
      if (path.endsWith('/Movie-Memory/add')) return 'add';
      if (path.endsWith('/Movie-Memory/movie')) return 'movie';
      if (path.endsWith('/Movie-Memory/posters')) return 'posters';
      if (path.endsWith('/Movie-Memory/rewatch')) return 'rewatch';
      if (path.endsWith('/Movie-Memory/review')) return 'review';
      if (path.endsWith('/Movie-Memory/settings')) return 'settings';
      return 'home';
    };
    const openAsPage = dialog => {
      document.body.classList.add('route-page');
      const backButton = dialog.querySelector('.close-modal-btn');
      if (backButton) {
        backButton.textContent = '←';
        backButton.title = 'กลับ';
      }
      if (!dialog.open) dialog.show();
    };
    const goHome = () => { window.location.href = APP_HOME; };
    const closeLocalPage = dialog => {
      dialog.close();
      document.body.classList.remove('route-page');
    };

    function safeText(value, maxLength = 500) {
      return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
    }

    function safeImage(value) {
      const image = safeText(value, 1500000);
      return /^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(image) ? image : '';
    }

    function normalizeViewing(raw, fallback = {}, index = 0) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '';
      const allowedFormats = ['โรงภาพยนตร์', 'Streaming', 'แผ่น / Digital', 'เทศกาลหนัง', 'อื่น ๆ'];
      const rawId = safeText(value.id, 80);
      const watchDate = validDate(value.watchDate)
        ? value.watchDate
        : validDate(fallback.watchDate)
          ? fallback.watchDate
          : new Date().toISOString().slice(0, 10);
      return {
        id: /^[a-zA-Z0-9_-]+$/.test(rawId) ? rawId : `v_${Date.now()}_${index}`,
        watchDate,
        format: allowedFormats.includes(value.format)
          ? value.format
          : allowedFormats.includes(fallback.format)
            ? fallback.format
            : 'โรงภาพยนตร์',
        cinema: safeText(value.cinema ?? fallback.cinema, 80),
        seat: safeText(value.seat ?? fallback.seat, 40),
        companion: safeText(value.companion ?? fallback.companion, 80),
        memory: safeText(value.memory, 800),
        ticketImg: safeImage(value.ticketImg || fallback.ticketImg),
        createdAt: safeText(value.createdAt, 40)
      };
    }

    function latestViewing(movie) {
      const viewings = Array.isArray(movie?.viewings) ? movie.viewings : [];
      return viewings.reduce((latest, viewing) => {
        if (!latest) return viewing;
        const latestKey = `${latest.watchDate || ''}|${latest.createdAt || ''}|${latest.id || ''}`;
        const viewingKey = `${viewing.watchDate || ''}|${viewing.createdAt || ''}|${viewing.id || ''}`;
        return viewingKey > latestKey ? viewing : latest;
      }, null);
    }

    function normalizeMovie(raw, index = 0) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const rawId = safeText(value.id, 80);
      const id = /^[a-zA-Z0-9_-]+$/.test(rawId) ? rawId : `m_${Date.now()}_${index}`;
      const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '';
      const allowedFormats = ['โรงภาพยนตร์', 'Streaming', 'แผ่น / Digital', 'เทศกาลหนัง', 'อื่น ๆ'];
      const format = allowedFormats.includes(value.format) ? value.format : 'โรงภาพยนตร์';
      const rating = Math.min(5, Math.max(0, Math.round((Number(value.rating) || 0) * 2) / 2));

      const rawViewings = Array.isArray(value.viewings) && value.viewings.length
        ? value.viewings
        : [{
            id: `v_legacy_${id}`,
            watchDate: value.watchDate,
            format: value.format,
            cinema: value.cinema,
            seat: value.seat,
            companion: value.companion,
            ticketImg: value.ticketImg,
            createdAt: value.updatedAt
          }];
      const viewings = rawViewings.map((viewing, viewingIndex) => normalizeViewing(viewing, value, viewingIndex));
      const latest = latestViewing({ viewings }) || normalizeViewing({}, value, 0);

      return {
        id,
        tmdbId: Number.isInteger(Number(value.tmdbId)) && Number(value.tmdbId) > 0 ? Number(value.tmdbId) : null,
        title: safeText(value.title, 100) || 'บันทึกความทรงจำภาพยนตร์',
        watchDate: latest.watchDate,
        releaseDate: validDate(value.releaseDate) ? value.releaseDate : '',
        format: latest.format || format,
        cinema: latest.cinema,
        seat: latest.seat,
        companion: latest.companion,
        rating,
        note: safeText(value.note, 1000),
        posterImg: safeImage(value.posterImg || value.image),
        ticketImg: latest.ticketImg,
        viewings,
        updatedAt: safeText(value.updatedAt, 40)
      };
    }

    function loadMoviesFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('taithai_movie_memory_v1');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(normalizeMovie) : [];
      } catch (e) {
        return [];
      }
    }

    function saveMoviesToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
        localStorage.setItem('movie_memory_local_dirty', '1');
        window.dispatchEvent(new CustomEvent('movie-memory:changed', { detail: movies }));
      } catch (e) {
        showToast('⚠️ พื้นที่จัดเก็บเต็ม! ลองลดขนาดรูปภาพ');
      }
    }

    window.addEventListener('movie-memory:replace', event => {
      const incoming = Array.isArray(event.detail) ? event.detail : [];
      movies = incoming.map(normalizeMovie);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
      } catch (error) {
        showToast('ซิงก์ข้อมูลสำเร็จ แต่พื้นที่เก็บข้อมูลในเครื่องไม่เพียงพอ');
      }
      if (document.readyState !== 'loading') renderCollection();
    });

    function showToast(msg) {
      const toast = $('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function formatDate(dateStr) {
      if (!dateStr) return 'ไม่ระบุวันที่';
      try {
        const d = new Date(dateStr + 'T12:00:00');
        return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
      } catch {
        return dateStr;
      }
    }

    function formatStars(rating) {
      const num = Math.min(5, Math.max(0, Math.round((Number(rating) || 0) * 2) / 2));
      const full = Math.floor(num);
      const half = num % 1 !== 0;
      return `${'★'.repeat(full)}${half ? '½' : ''}${'☆'.repeat(5 - Math.ceil(num))}`;
    }

    function movieWatchCount(movie) {
      return Math.max(1, Array.isArray(movie?.viewings) ? movie.viewings.length : 0);
    }

    function allViewings() {
      return movies.flatMap(movie => Array.isArray(movie.viewings) ? movie.viewings : []);
    }

    function normalizeCatalogTitle(value) {
      return safeText(value, 120).toLocaleLowerCase('th').replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function alreadyInCollection(item) {
      const tmdbId = Number(item?.id || item?.tmdbId) || null;
      if (tmdbId && movies.some(movie => Number(movie.tmdbId) === tmdbId)) return true;
      const title = normalizeCatalogTitle(item?.title);
      const releaseYear = safeText(item?.release_date || item?.releaseDate, 10).slice(0, 4);
      return Boolean(title) && movies.some(movie => {
        if (normalizeCatalogTitle(movie.title) !== title) return false;
        const savedYear = safeText(movie.releaseDate, 10).slice(0, 4);
        return !releaseYear || !savedYear || releaseYear === savedYear;
      });
    }

    function getFilteredMovies() {
      const q = $('searchInput').value.trim().toLowerCase();
      const yr = $('yearFilter').value;
      const fmt = $('formatFilter').value;
      const sort = $('sortSelect').value;

      let list = movies.filter(m => {
        const viewingText = (Array.isArray(m.viewings) ? m.viewings : [])
          .flatMap(viewing => [viewing.cinema, viewing.seat, viewing.companion, viewing.memory, viewing.format]);
        const combinedText = [m.title, m.note, ...viewingText].join(' ').toLowerCase();
        const matchQuery = !q || combinedText.includes(q);
        const matchYear = yr === 'all' || (Array.isArray(m.viewings) ? m.viewings : []).some(viewing => (viewing.watchDate || '').startsWith(yr));
        const matchFormat = fmt === 'all' || (Array.isArray(m.viewings) ? m.viewings : []).some(viewing => (viewing.format || '').includes(fmt));
        return matchQuery && matchYear && matchFormat;
      });

      list.sort((a, b) => {
        if (sort === 'oldest') return (a.watchDate || '').localeCompare(b.watchDate || '');
        if (sort === 'release-newest') {
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return b.releaseDate.localeCompare(a.releaseDate);
        }
        if (sort === 'release-oldest') {
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return a.releaseDate.localeCompare(b.releaseDate);
        }
        if (sort === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'th');
        return (b.watchDate || '').localeCompare(a.watchDate || '');
      });

      return list;
    }

    function updateYearFilterOptions() {
      const yearFilter = $('yearFilter');
      const selectedYear = yearFilter.value;
      const years = [...new Set(allViewings().map(viewing => (viewing.watchDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
      
      yearFilter.innerHTML = '<option value="all">ทุกปี</option>' + years.map(y => `<option value="${y}">${Number(y) + 543}</option>`).join('');
      if (years.includes(selectedYear) || selectedYear === 'all') {
        yearFilter.value = selectedYear;
      }
    }

    function persistFilterSettings() {
      try {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
          search: $('searchInput').value,
          year: $('yearFilter').value,
          format: $('formatFilter').value,
          sort: $('sortSelect').value
        }));
      } catch {}
    }

    function restoreFilterSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
        const setIfAvailable = (element, value, fallback) => {
          const hasOption = [...element.options].some(option => option.value === value);
          element.value = hasOption ? value : fallback;
        };
        $('searchInput').value = typeof saved.search === 'string' ? saved.search.slice(0, 200) : '';
        setIfAvailable($('yearFilter'), saved.year, 'all');
        setIfAvailable($('formatFilter'), saved.format, 'all');
        setIfAvailable($('sortSelect'), saved.sort, 'newest');
      } catch {
        localStorage.removeItem(FILTER_STORAGE_KEY);
      }
    }

    function resetFilterSettings() {
      $('searchInput').value = '';
      $('yearFilter').value = 'all';
      $('formatFilter').value = 'all';
      $('sortSelect').value = 'newest';
      try {
        localStorage.removeItem(FILTER_STORAGE_KEY);
      } catch {}
      document.querySelector('.toolbar').classList.remove('filters-open');
      $('mobileFilterToggle').setAttribute('aria-expanded', 'false');
    }

    function renderCollection() {
      const grid = $('collectionGrid');
      updateYearFilterOptions();
      const filtered = getFilteredMovies();
      const filtersActive = Boolean(
        $('searchInput').value.trim() ||
        $('yearFilter').value !== 'all' ||
        $('formatFilter').value !== 'all' ||
        $('sortSelect').value !== 'newest'
      );
      const advancedFilterCount = Number($('yearFilter').value !== 'all') +
        Number($('formatFilter').value !== 'all') +
        Number($('sortSelect').value !== 'newest');
      $('mobileFilterLabel').textContent = advancedFilterCount ? `ตัวกรอง · ${advancedFilterCount}` : 'ตัวกรอง';
      $('mobileFilterToggle').classList.toggle('active', advancedFilterCount > 0);

      $('resultSummary').textContent = movies.length
        ? filtersActive
          ? `พบ ${filtered.length} จาก ${movies.length} เรื่อง`
          : `${movies.length} เรื่อง · เก็บไว้เป็นความทรงจำแล้ว`
        : 'ยังไม่มีหนังในคอลเลกชัน';
      $('clearFiltersBtn').disabled = !filtersActive;

      grid.className = 'collection-grid';
      if (currentViewMode === 'list') grid.classList.add('list-view');
      if (currentViewMode === 'ticket') grid.classList.add('ticket-view');

      $('viewGridBtn').classList.toggle('active', currentViewMode === 'grid');
      $('viewListBtn').classList.toggle('active', currentViewMode === 'list');
      $('viewTicketBtn').classList.toggle('active', currentViewMode === 'ticket');

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${movies.length ? '🔎' : '🎬'}</div>
            <h3>${movies.length ? 'ไม่พบหนังที่ค้นหา' : 'ยังไม่มีความทรงจำภาพยนตร์'}</h3>
            <p>${movies.length ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูหนังทั้งหมด' : 'เริ่มบันทึกหนังเรื่องแรก แล้วค่อย ๆ สร้างคอลเลกชันความทรงจำของคุณ'}</p>
            <button class="btn btn-primary" type="button" data-empty-action="${movies.length ? 'clear' : 'add'}">${movies.length ? 'ล้างตัวกรอง' : '✨ ＋ เพิ่มหนังเรื่องแรก'}</button>
          </div>
        `;
        return;
      }

      if (currentViewMode === 'ticket') {
        grid.innerHTML = filtered.map(m => {
          const displayImg = m.ticketImg || m.posterImg || '';
          return `
            <div class="ticket-stub-card" onclick="openInspectDialog('${m.id}')" role="link" tabindex="0" data-movie-id="${m.id}" aria-label="เปิดรายละเอียด ${escapeHtml(m.title)}">
              <div class="ticket-stub-top">
                <span class="ticket-cinema-badge">${escapeHtml(m.cinema || m.format || 'CINEMA')}</span>
                <span style="font-size:11px; color:var(--gold); font-weight:700">ดู ${movieWatchCount(m)} ครั้ง</span>
              </div>
              <div class="ticket-stub-body">
                <div class="ticket-thumb">
                  ${displayImg ? `<img src="${escapeHtml(displayImg)}" class="vertical-aspect" alt="${escapeHtml(m.title)}" loading="lazy" decoding="async">` : `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:28px">🎟️</div>`}
                </div>
                <div class="ticket-info">
                  <div class="ticket-title">${escapeHtml(m.title || 'ไม่มีชื่อ')}</div>
                  <div class="ticket-details">
                    <span>SEAT: ${escapeHtml(m.seat || '-')}</span>
                    <span>WITH: ${escapeHtml(m.companion || '-')}</span>
                  </div>
                  <div style="color:var(--gold); font-size:13px">${formatStars(m.rating)}</div>
                  <div class="ticket-barcode"></div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        grid.innerHTML = filtered.map(m => {
          const displayImg = m.posterImg || m.ticketImg || '';
          return `
            <div class="movie-card" onclick="openInspectDialog('${m.id}')" role="link" tabindex="0" data-movie-id="${m.id}" aria-label="เปิดรายละเอียด ${escapeHtml(m.title)}">
              <div class="poster-bg">
                ${displayImg ? `<img src="${escapeHtml(displayImg)}" alt="${escapeHtml(m.title)}" loading="lazy" decoding="async">` : `<div class="no-poster-fill">🎬</div>`}
                <div class="poster-overlay"></div>
              </div>
              <div class="card-header">
                <span class="badge-format">${escapeHtml(m.format || 'โรงภาพยนตร์')}</span>
                <span class="badge-watch-count">ดู ${movieWatchCount(m)} ครั้ง</span>
                ${m.releaseDate ? `<span class="badge-release">ฉาย ${escapeHtml(m.releaseDate.slice(0, 4))}</span>` : ''}
              </div>
              <div class="card-content">
                <div class="watch-date-chip">📅 ${formatDate(m.watchDate)}</div>
                <h3>${escapeHtml(m.title || 'ไม่มีชื่อหนัง')}</h3>
                <div class="card-meta-pills">
                  ${m.cinema ? `<span class="meta-pill">📍 ${escapeHtml(m.cinema)}</span>` : ''}
                  ${m.seat ? `<span class="meta-pill">💺 ${escapeHtml(m.seat)}</span>` : ''}
                  ${m.companion ? `<span class="meta-pill">👥 ${escapeHtml(m.companion)}</span>` : ''}
                </div>
                <div class="card-stars">${formatStars(m.rating)}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Dialog & Wizard Controls
    function openAddDialog(asRoute = false) {
      if (!IS_FILE_MODE && !asRoute && currentRoute() !== 'add') {
        window.location.href = `${APP_ROUTES}/add/`;
        return;
      }
      resetForm();
      $('modalHeaderTitle').textContent = 'เพิ่มความทรงจำหนังใหม่';
      $('deleteEntryBtn').style.display = 'none';
      switchWizardStep(1);
      openAsPage($('addEditModal'));
    }

    function closeAddDialog() {
      if (IS_FILE_MODE) closeLocalPage($('addEditModal'));
      else if (currentRoute() === 'add') goHome();
      else $('addEditModal').close();
    }

    function switchWizardStep(stepNum) {
      $('wizardStep1').style.display = stepNum === 1 ? 'grid' : 'none';
      $('wizardStep2').style.display = stepNum === 2 ? 'block' : 'none';
      $('movieForm').style.display = stepNum === 3 ? 'flex' : 'none';

      $('stepIndicator1').className = `wizard-step ${stepNum === 1 ? 'active' : stepNum > 1 ? 'done' : ''}`;
      $('stepIndicator2').className = `wizard-step ${stepNum === 2 ? 'active' : stepNum > 2 ? 'done' : ''}`;
      $('stepIndicator3').className = `wizard-step ${stepNum === 3 ? 'active' : ''}`;

      if (stepNum === 2) {
        fetchCatalogMovies(1, true);
      }
    }

    // Fetch movie catalog & search recommendations
    async function fetchCatalogMovies(page = 1, reset = false) {
      if (isCatalogLoading) return;
      isCatalogLoading = true;
      catalogPage = page;
      
      const query = $('catalogSearchInput').value.trim();
      catalogQuery = query;

      const listGrid = $('catalogResultsList');
      if (reset) {
        listGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--muted)">กำลังโหลดรายชื่อหนัง...</div>';
      }

      $('catalogSectionLabel').textContent = query ? `🔍 ผลการค้นหา "${query}"` : '🔥 รายชื่อหนังแนะนำ';

      try {
        let url = `${BASE_URL}/movie/popular?api_key=${API_KEY}&language=th-TH&page=${page}`;
        if (query) {
          url = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=th-TH&query=${encodeURIComponent(query)}&page=${page}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        const results = (data.results || []).filter(item => !alreadyInCollection(item));

        if (reset) catalogMoviesList = [];
        const knownCatalogIds = new Set(catalogMoviesList.map(item => item.id));
        catalogMoviesList = [...catalogMoviesList, ...results.filter(item => !knownCatalogIds.has(item.id))];

        if (catalogMoviesList.length === 0) {
          listGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--muted)">
            ${query ? 'ไม่พบหนังเรื่องใหม่ หนังที่อยู่ในคอลเลกชันแล้วจะไม่แสดงที่นี่' : 'หนังในหน้านี้อยู่ในคอลเลกชันแล้ว ลองโหลดรายการเพิ่ม'}
          </div>`;
          isCatalogLoading = false;
          return;
        }

        listGrid.innerHTML = catalogMoviesList.map(item => {
          const poster = item.poster_path ? `${IMG_URL}${item.poster_path}` : '';
          const yr = item.release_date ? item.release_date.slice(0, 4) : '';
          return `
            <button class="catalog-item-card" type="button" data-tmdb-id="${item.id}" onclick="selectCatalogMovie(${item.id})">
              <div class="catalog-poster-thumb">
                ${poster ? `<img src="${poster}" class="vertical-aspect" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">` : `<div style="width:100%;height:100%;display:grid;place-items:center;color:var(--muted);font-size:24px">🎬</div>`}
              </div>
              <div class="catalog-item-info">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${yr ? `ปี ${yr}` : 'ภาพยนตร์'}</span>
              </div>
            </button>
          `;
        }).join('');

        if (data.page < data.total_pages) {
          const loadMoreDiv = document.createElement('div');
          loadMoreDiv.className = 'load-more-btn-wrap';
          loadMoreDiv.style.cssText = 'grid-column: 1 / -1; text-align: center; margin-top: 10px;';
          loadMoreDiv.innerHTML = `<button class="btn btn-ghost" type="button" onclick="fetchCatalogMovies(${page + 1}, false)">โหลดรายชื่อหนังเพิ่ม ＋</button>`;
          listGrid.appendChild(loadMoreDiv);
        }

      } catch (err) {
        if (reset) {
          listGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--muted)">ไม่สามารถโหลดข้อมูลรายชื่อหนังได้ กรุณาลองใหม่อีกครั้ง</div>';
        }
      } finally {
        isCatalogLoading = false;
      }
    }

    function selectCatalogMovie(movieId) {
      const selected = catalogMoviesList.find(m => m.id === movieId);
      if (!selected) return;
      if (alreadyInCollection(selected)) {
        showToast('หนังเรื่องนี้อยู่ในคอลเลกชันแล้ว กด “ดูอีกครั้ง” จากหน้ารายละเอียดได้เลย');
        return;
      }

      $('formTmdbId').value = selected.id;
      $('formTitleInput').value = selected.title || '';
      $('formReleaseDate').value = selected.release_date || '';
      if (selected.poster_path) {
        const fullPosterUrl = `${IMG_URL}${selected.poster_path}`;
        $('formPosterData').value = fullPosterUrl;
        $('posterPreviewImg').src = fullPosterUrl;
        $('posterPreviewImg').style.display = 'block';
        $('posterOverlayInfo').style.display = 'block';
        $('posterOverlayInfo').innerHTML = '🎬<br><strong>เลือกโปสเตอร์นี้แล้ว</strong><br><small style="color:var(--gold)">🔍 คลิกเพื่อเปลี่ยนเรื่อง</small>';
      }

      $('selectedFilmTitleTxt').textContent = `🎬 ${selected.title}`;
      $('selectedFilmSubTxt').textContent = selected.release_date ? `ปีฉาย: ${selected.release_date.slice(0,4)}` : '';
      $('selectedFilmBanner').style.display = 'block';

      switchWizardStep(3);
    }

    function resetForm() {
      $('formMovieId').value = '';
      $('formTmdbId').value = '';
      $('formReleaseDate').value = '';
      $('formPosterData').value = '';
      $('formTicketData').value = '';
      $('formTitleInput').value = '';
      $('formWatchDateInput').value = new Date().toISOString().split('T')[0];
      $('formFormatInput').value = 'โรงภาพยนตร์';
      $('formCinemaInput').value = '';
      $('formSeatInput').value = '';
      $('formCompanionInput').value = '';
      $('formViewingNoteInput').value = '';
      $('formNoteInput').value = '';
      $('formRatingVal').value = '0';

      $('posterPreviewImg').src = '';
      $('posterPreviewImg').style.display = 'none';
      $('posterOverlayInfo').style.display = 'block';
      $('posterOverlayInfo').innerHTML = '🎬<br><strong>เลือกโปสเตอร์หนัง</strong><br><small style="color:var(--gold)">🔍 ค้นหาและเลือกจากรายชื่อหนัง</small>';

      $('ticketPreviewImg').src = '';
      $('ticketPreviewImg').style.display = 'none';
      $('ticketOverlayInfo').style.display = 'block';
      $('ticketOverlayInfo').innerHTML = '🎟️<br><strong>อัปโหลดตั๋วหนัง</strong><br><small style="color:var(--muted)">คลิกเพื่อเพิ่มรูปถ่ายตั๋วจริง</small>';

      $('selectedFilmBanner').style.display = 'none';
      updateRatingStarsUI(0);
    }

    function updateRatingStarsUI(rating) {
      const value = Math.min(5, Math.max(0, Math.round((Number(rating) || 0) * 2) / 2));
      const btns = document.querySelectorAll('#ratingPicker .star-btn');
      btns.forEach((btn, idx) => {
        const star = idx + 1;
        const isFull = value >= star;
        const isHalf = value === star - 0.5;
        btn.classList.toggle('active', isFull);
        btn.classList.toggle('half', isHalf);
        btn.textContent = isFull || isHalf ? '★' : '☆';
        btn.setAttribute('aria-pressed', String(isFull || isHalf));
      });
      $('ratingValueLabel').textContent = `${value} / 5`;
    }

    function updateReviewRatingStarsUI(rating) {
      const value = Math.min(5, Math.max(0, Math.round((Number(rating) || 0) * 2) / 2));
      document.querySelectorAll('#reviewRatingPicker .star-btn').forEach((btn, idx) => {
        const star = idx + 1;
        const isFull = value >= star;
        const isHalf = value === star - 0.5;
        btn.classList.toggle('active', isFull);
        btn.classList.toggle('half', isHalf);
        btn.textContent = isFull || isHalf ? '★' : '☆';
        btn.setAttribute('aria-pressed', String(isFull || isHalf));
      });
      $('reviewRatingValueLabel').textContent = `${value} / 5`;
    }

    function syncLatestViewingFields(movie) {
      const latest = latestViewing(movie);
      if (!latest) return movie;
      movie.watchDate = latest.watchDate;
      movie.format = latest.format;
      movie.cinema = latest.cinema;
      movie.seat = latest.seat;
      movie.companion = latest.companion;
      movie.ticketImg = latest.ticketImg;
      return movie;
    }

    // Direct Save Function triggered by Save Button at Bottom
    function executeSaveMovie() {
      let title = $('formTitleInput').value.trim();
      if (!title) {
        $('formTitleInput').focus();
        $('formTitleInput').reportValidity();
        showToast('กรุณาใส่ชื่อภาพยนตร์');
        return;
      }

      const id = $('formMovieId').value || ('m_' + Date.now());
      const tmdbId = Number($('formTmdbId').value) || null;
      const releaseDate = $('formReleaseDate').value;
      const watchDate = $('formWatchDateInput').value || new Date().toISOString().split('T')[0];
      const format = $('formFormatInput').value;
      const cinema = $('formCinemaInput').value.trim();
      const seat = $('formSeatInput').value.trim();
      const companion = $('formCompanionInput').value.trim();
      const rating = Number($('formRatingVal').value) || 0;
      const note = $('formNoteInput').value.trim();
      const viewingMemory = $('formViewingNoteInput').value.trim();
      const posterImg = $('formPosterData').value;
      const ticketImg = $('formTicketData').value;
      const duplicate = movies.find(movie => {
        if (tmdbId && Number(movie.tmdbId) === tmdbId) return true;
        return normalizeCatalogTitle(movie.title) === normalizeCatalogTitle(title)
          && (!releaseDate || !movie.releaseDate || movie.releaseDate.slice(0, 4) === releaseDate.slice(0, 4));
      });
      if (duplicate && duplicate.id !== id) {
        showToast('หนังเรื่องนี้มีอยู่แล้ว กด “ดูอีกครั้ง” จากหน้ารายละเอียด');
        return;
      }

      const now = new Date().toISOString();
      const viewing = normalizeViewing({
        id: `v_${Date.now()}`,
        watchDate,
        format,
        cinema,
        seat,
        companion,
        memory: viewingMemory,
        ticketImg,
        createdAt: now
      });

      const movieObj = {
        id,
        tmdbId,
        title,
        watchDate,
        releaseDate,
        format,
        cinema,
        seat,
        companion,
        rating,
        note,
        posterImg,
        ticketImg,
        viewings: [viewing],
        updatedAt: now
      };

      const existingIndex = movies.findIndex(m => m.id === id);
      if (existingIndex >= 0) {
        const existing = movies[existingIndex];
        movies[existingIndex] = {
          ...existing,
          rating,
          note,
          updatedAt: now
        };
      } else {
        movies.unshift(movieObj);
      }

      saveMoviesToStorage();
      renderCollection();
      if (currentRoute() === 'add') sessionStorage.setItem('movie_memory_flash', '✨ บันทึกตั๋วภาพยนตร์เรียบร้อยแล้ว');
      closeAddDialog();
      showToast('✨ บันทึกตั๋วภาพยนตร์เรียบร้อยแล้ว');
    }

    function renderWatchHistory(movie) {
      const viewings = [...(Array.isArray(movie.viewings) ? movie.viewings : [])]
        .sort((a, b) => `${b.watchDate || ''}|${b.createdAt || ''}|${b.id || ''}`.localeCompare(`${a.watchDate || ''}|${a.createdAt || ''}|${a.id || ''}`));
      $('inspectWatchHistory').innerHTML = viewings.map((viewing, index) => `
        <article class="watch-history-card">
          <div class="watch-history-index">${viewings.length - index}</div>
          <div class="watch-history-content">
            <div class="watch-history-top">
              <strong>${formatDate(viewing.watchDate)}</strong>
              <span>${escapeHtml(viewing.format || 'โรงภาพยนตร์')}</span>
            </div>
            <div class="watch-history-meta">
              ${viewing.cinema ? `<span>📍 ${escapeHtml(viewing.cinema)}</span>` : ''}
              ${viewing.seat ? `<span>💺 ${escapeHtml(viewing.seat)}</span>` : ''}
              <span>👥 ${escapeHtml(viewing.companion || 'ดูคนเดียว')}</span>
            </div>
            ${viewing.memory ? `<p>${escapeHtml(viewing.memory)}</p>` : ''}
            ${viewing.ticketImg ? `<img src="${escapeHtml(viewing.ticketImg)}" alt="ภาพความทรงจำจากการดูครั้งนี้" loading="lazy" decoding="async">` : ''}
          </div>
        </article>
      `).join('');
    }

    // Inspector modal
    function openInspectDialog(id, asRoute = false) {
      if (!IS_FILE_MODE && !asRoute && currentRoute() !== 'movie') {
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(id)}`;
        return;
      }
      const movie = movies.find(m => m.id === id);
      if (!movie) {
        if (asRoute) goHome();
        return;
      }

      inspectingMovieId = id;
      resetDeleteConfirmation();
      const bgImg = movie.posterImg || movie.ticketImg || '';
      
      $('inspectBgImg').src = bgImg;
      $('inspectCoverImg').src = bgImg;
      $('inspectFormatBadge').textContent = movie.format || 'โรงภาพยนตร์';
      $('inspectWatchCount').textContent = `ดูแล้ว ${movieWatchCount(movie)} ครั้ง`;
      $('inspectTitleTxt').textContent = movie.title || 'ไม่มีชื่อ';
      $('inspectStarsTxt').textContent = formatStars(movie.rating);
      $('inspectNoteTxt').textContent = movie.note || 'ยังไม่มีรีวิวสำหรับหนังเรื่องนี้';
      renderWatchHistory(movie);

      openAsPage($('inspectModal'));
    }

    async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4500) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error('REQUEST_FAILED');
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    }

    function decodeShareImage(src, useCors = false, timeoutMs = 4500) {
      return new Promise(resolve => {
        if (!src) return resolve(null);
        const image = new Image();
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          resolve(value);
        };
        const timeout = setTimeout(() => finish(null), timeoutMs);
        if (useCors) image.crossOrigin = 'anonymous';
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = src;
      });
    }

    async function loadShareImage(src) {
      if (!src) return null;
      if (/^data:image\//i.test(src)) return decodeShareImage(src);
      const candidates = [];
      try {
        const sourceUrl = new URL(src);
        if (sourceUrl.hostname === 'image.tmdb.org' && sourceUrl.pathname.startsWith('/t/p/')) {
          const proxyBases = window.location.protocol === 'file:'
            ? ['http://localhost:3000', 'https://taithai.app']
            : [''];
          proxyBases.forEach(proxyBase => {
            candidates.push({
              url: `${proxyBase}/api/movie-poster?url=${encodeURIComponent(sourceUrl.href)}`,
              useCors: Boolean(proxyBase)
            });
          });
          candidates.push({ url: sourceUrl.href, useCors: true });
        } else {
          candidates.push({ url: src, useCors: true });
        }
      } catch {
        candidates.push({ url: src, useCors: true });
      }
      for (const candidate of candidates) {
        const image = await decodeShareImage(candidate.url, candidate.useCors);
        if (image) return image;
      }
      return null;
    }

    async function resolveShareDetails(movie) {
      let englishTitle = movie.title || 'Untitled Movie';
      let tmdbPoster = '';
      const detailsPromise = (async () => {
        try {
          let details = null;
          if (movie.tmdbId) {
            details = await fetchJsonWithTimeout(`${BASE_URL}/movie/${encodeURIComponent(movie.tmdbId)}?api_key=${API_KEY}&language=en-US`);
          } else if (movie.title) {
            const search = await fetchJsonWithTimeout(`${BASE_URL}/search/movie?api_key=${API_KEY}&language=en-US&query=${encodeURIComponent(movie.title)}&page=1`);
            details = search.results?.[0] || null;
          }
          return details;
        } catch {
          return null;
        }
      })();

      const primaryPoster = movie.posterImg || movie.ticketImg;
      let poster = await loadShareImage(primaryPoster);
      const details = await detailsPromise;
      if (details) {
        englishTitle = details.title || details.original_title || englishTitle;
        if (details.poster_path) tmdbPoster = `${IMG_URL}${details.poster_path}`;
      }
      const posterCandidates = [...new Set([tmdbPoster, movie.ticketImg].filter(candidate => candidate && candidate !== primaryPoster))];
      for (const candidate of posterCandidates) {
        if (poster) break;
        poster = await loadShareImage(candidate);
      }
      return {
        title: englishTitle,
        poster
      };
    }

    function wrapShareText(context, text, maxWidth, maxLines = 3) {
      const source = String(text || '');
      const segments = source.includes(' ') ? source.split(/(\s+)/) : Array.from(source);
      const lines = [];
      let line = '';
      for (const segment of segments) {
        const candidate = line + segment;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line.trim());
          line = segment.trimStart();
          if (lines.length === maxLines) break;
        } else {
          line = candidate;
        }
      }
      if (line && lines.length < maxLines) lines.push(line.trim());
      return lines;
    }

    function formatStoryDate(dateString) {
      if (!dateString) return 'Date not specified';
      try {
        return new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(new Date(`${dateString}T12:00:00`));
      } catch {
        return dateString;
      }
    }

    function roundedCanvasRect(context, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + width, y, x + width, y + height, r);
      context.arcTo(x + width, y + height, x, y + height, r);
      context.arcTo(x, y + height, x, y, r);
      context.arcTo(x, y, x + width, y, r);
      context.closePath();
    }

    function englishStoryPlace(movie) {
      if (movie.cinema) return movie.cinema;
      const formats = {
        'โรงภาพยนตร์': 'Cinema',
        'Streaming': 'Streaming',
        'แผ่น / Digital': 'Disc / Digital',
        'เทศกาลหนัง': 'Film Festival',
        'อื่น ๆ': 'Other'
      };
      return formats[movie.format] || movie.format || 'Not specified';
    }

    function getStoryOwnerId() {
      const accountId = $('userEmail')?.textContent?.trim() || '';
      if (/^@[a-zA-Z0-9._]{3,24}$/.test(accountId)) return accountId;
      return '@guest';
    }

    async function createMovieStory(movie, shareDetails, options = {}) {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const context = canvas.getContext('2d');
      const poster = shareDetails.poster;

      const baseColor = normalizeStoryColor(options.backgroundColor || '#1d110a');
      const background = context.createLinearGradient(0, 0, 1080, 1920);
      background.addColorStop(0, mixStoryColor(baseColor, '#ffffff', 0.12));
      background.addColorStop(0.45, mixStoryColor(baseColor, '#000000', 0.18));
      background.addColorStop(1, mixStoryColor(baseColor, '#000000', 0.52));
      context.fillStyle = background;
      context.fillRect(0, 0, 1080, 1920);

      context.strokeStyle = 'rgba(255,181,71,.32)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(90, 92);
      context.lineTo(385, 92);
      context.moveTo(695, 92);
      context.lineTo(990, 92);
      context.stroke();
      context.textAlign = 'center';
      context.fillStyle = '#ffb547';
      context.font = '700 20px sans-serif';
      context.fillText('TAITHAI', 540, 100);
      context.fillStyle = '#f8f1e7';
      context.font = '700 45px sans-serif';
      context.fillText('MOVIE MEMORY', 540, 168);
      context.fillStyle = '#8d8075';
      context.font = '500 17px sans-serif';
      context.fillText('PERSONAL CINEMA ARCHIVE', 540, 202);

      const posterX = 150;
      const posterY = 242;
      const posterWidth = 780;
      const posterHeight = 1170;
      context.save();
      context.shadowColor = 'rgba(0,0,0,.72)';
      context.shadowBlur = 85;
      context.shadowOffsetY = 35;
      context.fillStyle = '#21160f';
      roundedCanvasRect(context, posterX, posterY, posterWidth, posterHeight, 32);
      context.fill();
      context.restore();

      context.save();
      roundedCanvasRect(context, posterX, posterY, posterWidth, posterHeight, 32);
      context.clip();
      if (poster) {
        const scale = Math.max(posterWidth / poster.width, posterHeight / poster.height);
        const width = poster.width * scale;
        const height = poster.height * scale;
        context.drawImage(poster, posterX + ((posterWidth - width) / 2), posterY + ((posterHeight - height) / 2), width, height);
      } else {
        context.fillStyle = '#24160f';
        context.fillRect(posterX, posterY, posterWidth, posterHeight);
        context.textAlign = 'center';
        context.font = '150px sans-serif';
        context.fillText('🎬', 540, 650);
      }
      context.restore();

      context.strokeStyle = 'rgba(255,181,71,.52)';
      context.lineWidth = 3;
      roundedCanvasRect(context, posterX, posterY, posterWidth, posterHeight, 32);
      context.stroke();

      const rating = Math.min(5, Math.max(0, Math.round((Number(movie.rating) || 0) * 2) / 2));
      if (poster?.shareObjectUrl) URL.revokeObjectURL(poster.shareObjectUrl);

      context.textAlign = 'center';
      context.fillStyle = '#f8f1e7';
      context.font = '700 27px sans-serif';
      context.fillText('WATCHED', 540, 1510);
      context.fillStyle = '#ffb547';
      context.font = '700 36px sans-serif';
      context.fillText(formatStoryDate(movie.watchDate).toUpperCase(), 540, 1562);
      context.fillStyle = '#ffb547';
      context.font = '700 22px sans-serif';
      context.fillText(`FROM ${getStoryOwnerId()}`, 540, 1607);
      context.fillStyle = '#8d8075';
      context.font = '600 18px sans-serif';
      context.fillText('AT', 540, 1645);
      context.fillStyle = '#f8f1e7';
      context.font = '600 27px sans-serif';
      const storyPlace = englishStoryPlace(movie);
      if (context.measureText(storyPlace).width > 820) context.font = '600 23px sans-serif';
      context.fillText(storyPlace, 540, 1690);

      const linkText = 'taithai.app/Movie-Memory';
      context.strokeStyle = 'rgba(255,181,71,.28)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(78, 1725);
      context.lineTo(1002, 1725);
      context.stroke();

      context.textAlign = 'left';
      context.fillStyle = '#ffb547';
      context.font = '700 24px sans-serif';
      context.fillText(`↗  ${linkText}`, 78, 1788);

      context.textAlign = 'right';
      context.fillStyle = '#ffb547';
      context.font = '700 36px sans-serif';
      context.fillText(formatStars(rating), 1002, 1768);
      context.fillStyle = '#f8f1e7';
      context.font = '600 18px sans-serif';
      context.fillText(rating ? `${rating} / 5 STARS` : 'NOT RATED', 1002, 1803);

      return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.96));
    }

    function normalizeStoryColor(color) {
      return /^#[0-9a-f]{6}$/i.test(color || '') ? color.toLowerCase() : '#1d110a';
    }

    function storyHexToRgb(color) {
      const value = normalizeStoryColor(color).slice(1);
      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
      };
    }

    function storyRgbToHex(r, g, b) {
      return '#' + [r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
    }

    function mixStoryColor(first, second, amount) {
      const a = storyHexToRgb(first);
      const b = storyHexToRgb(second);
      return storyRgbToHex(
        a.r + ((b.r - a.r) * amount),
        a.g + ((b.g - a.g) * amount),
        a.b + ((b.b - a.b) * amount)
      );
    }

    function averagePosterColor(image) {
      if (!image) return '#1d110a';
      try {
        const sample = document.createElement('canvas');
        sample.width = 48;
        sample.height = 72;
        const context = sample.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, sample.width, sample.height);
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weight = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index + 3] < 128) continue;
          const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 765;
          const pixelWeight = 0.45 + (1 - Math.abs(brightness - 0.5)) * 0.55;
          red += pixels[index] * pixelWeight;
          green += pixels[index + 1] * pixelWeight;
          blue += pixels[index + 2] * pixelWeight;
          weight += pixelWeight;
        }
        if (!weight) return '#1d110a';
        const average = storyRgbToHex(red / weight, green / weight, blue / weight);
        return mixStoryColor(average, '#000000', 0.34);
      } catch {
        return '#1d110a';
      }
    }

    function setStoryBackground(color, source = 'custom') {
      const normalized = normalizeStoryColor(color);
      storyEditorState.backgroundColor = normalized;
      $('storyBackgroundColor').value = normalized;
      $('storyBackgroundHex').textContent = normalized.toUpperCase();
      $('storyAverageColorBtn').classList.toggle('active', source === 'average');
      document.querySelectorAll('[data-story-color]').forEach(button => {
        button.classList.toggle('active', button.dataset.storyColor.toLowerCase() === normalized);
      });
      scheduleStoryPreview();
    }

    function cleanupStoryPreview() {
      clearTimeout(storyEditorState.renderTimer);
      storyEditorState.renderVersion += 1;
      if (storyEditorState.previewUrl) URL.revokeObjectURL(storyEditorState.previewUrl);
      storyEditorState.previewUrl = '';
      storyEditorState.previewBlob = null;
    }

    async function renderStoryPreview() {
      const movie = storyEditorState.movie;
      const shareDetails = storyEditorState.shareDetails;
      if (!movie || !shareDetails) return;
      const version = ++storyEditorState.renderVersion;
      $('storyPreviewLoading').hidden = false;
      try {
        const blob = await createMovieStory(movie, shareDetails, {
          backgroundColor: storyEditorState.backgroundColor
        });
        if (!blob || version !== storyEditorState.renderVersion) return;
        if (storyEditorState.previewUrl) URL.revokeObjectURL(storyEditorState.previewUrl);
        storyEditorState.previewBlob = blob;
        storyEditorState.previewUrl = URL.createObjectURL(blob);
        $('storyPreviewImg').src = storyEditorState.previewUrl;
      } catch {
        showToast('สร้างตัวอย่างไม่สำเร็จ กรุณาลองใหม่');
      } finally {
        if (version === storyEditorState.renderVersion) $('storyPreviewLoading').hidden = true;
      }
    }

    function scheduleStoryPreview() {
      clearTimeout(storyEditorState.renderTimer);
      storyEditorState.renderTimer = setTimeout(renderStoryPreview, 120);
    }

    async function openStoryEditor() {
      const movie = movies.find(item => item.id === inspectingMovieId);
      if (!movie) return;
      const button = $('inspectShareBtn');
      button.disabled = true;
      button.textContent = 'กำลังเตรียมภาพ…';
      cleanupStoryPreview();
      $('storyPreviewImg').removeAttribute('src');
      $('storyPreviewLoading').hidden = false;
      try {
        const shareDetails = await resolveShareDetails(movie);
        const averageColor = averagePosterColor(shareDetails.poster);
        storyEditorState.movie = movie;
        storyEditorState.shareDetails = shareDetails;
        storyEditorState.averageColor = averageColor;
        $('storyAverageSwatch').style.background = averageColor;
        if (!$('storyEditorModal').open) $('storyEditorModal').showModal();
        setStoryBackground(averageColor, 'average');
      } catch {
        showToast('เตรียมภาพสำหรับแชร์ไม่สำเร็จ กรุณาลองใหม่');
      } finally {
        button.disabled = false;
        button.textContent = '✦ แชร์ลง IG Story';
      }
    }

    function closeStoryEditor() {
      if ($('storyEditorModal').open) $('storyEditorModal').close();
      cleanupStoryPreview();
      storyEditorState.movie = null;
      storyEditorState.shareDetails = null;
    }

    async function shareEditedStory() {
      const movie = storyEditorState.movie;
      const shareDetails = storyEditorState.shareDetails;
      if (!movie || !shareDetails) return;
      const button = $('confirmStoryShareBtn');
      button.disabled = true;
      button.textContent = 'กำลังสร้างภาพ…';
      try {
        const blob = storyEditorState.previewBlob || await createMovieStory(movie, shareDetails, {
          backgroundColor: storyEditorState.backgroundColor
        });
        if (!blob) throw new Error('STORY_FAILED');
        const fileName = `movie-memory-${String(movie.title).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 45) || 'story'}.png`;
        const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
        const movieMemoryUrl = 'https://taithai.app/Movie-Memory';
        if (file && navigator.canShare?.({ files: [file] })) {
          const shareData = {
            files: [file],
            title: `${shareDetails.title} — ${Number(movie.rating) || 0}/5 stars`,
            text: `I watched: ${shareDetails.title}\n${movieMemoryUrl}`
          };
          if (navigator.canShare({ ...shareData, url: movieMemoryUrl })) shareData.url = movieMemoryUrl;
          await navigator.share(shareData);
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          showToast('✓ บันทึกภาพแล้ว นำไปลง IG Story ได้เลย');
        }
      } catch (error) {
        if (error?.name !== 'AbortError') showToast('สร้างภาพสำหรับแชร์ไม่สำเร็จ กรุณาลองใหม่');
      } finally {
        button.disabled = false;
        button.textContent = '✦ แชร์ภาพนี้';
      }
    }

    async function openPosterPicker(asRoute = false) {
      const movie = movies.find(m => m.id === inspectingMovieId);
      if (!movie) {
        if (asRoute) goHome();
        return;
      }
      if (!IS_FILE_MODE && !asRoute && currentRoute() !== 'posters') {
        window.location.href = `${APP_ROUTES}/posters/?id=${encodeURIComponent(movie.id)}`;
        return;
      }

      $('posterPickerTitle').textContent = movie.title;
      $('posterPickerGrid').innerHTML = '<div class="poster-picker-status">กำลังค้นหาโปสเตอร์จาก TMDB…</div>';
      openAsPage($('posterPickerModal'));

      try {
        let tmdbId = Number(movie.tmdbId) || null;
        if (!tmdbId) {
          const searchUrl = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=th-TH&query=${encodeURIComponent(movie.title)}&page=1`;
          const searchResponse = await fetch(searchUrl);
          if (!searchResponse.ok) throw new Error('SEARCH_FAILED');
          const searchData = await searchResponse.json();
          tmdbId = searchData.results?.[0]?.id || null;
          if (!tmdbId) throw new Error('MOVIE_NOT_FOUND');
          movie.tmdbId = tmdbId;
          saveMoviesToStorage();
        }

        const imageUrl = `${BASE_URL}/movie/${tmdbId}/images?api_key=${API_KEY}&include_image_language=th,en,null`;
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('IMAGES_FAILED');
        const data = await response.json();
        const seen = new Set();
        posterChoices = (data.posters || [])
          .filter(item => item.file_path && !seen.has(item.file_path) && seen.add(item.file_path))
          .slice(0, 40);

        if (!posterChoices.length) {
          $('posterPickerGrid').innerHTML = '<div class="poster-picker-status">ยังไม่มีโปสเตอร์แบบอื่นสำหรับหนังเรื่องนี้</div>';
          return;
        }

        $('posterPickerGrid').innerHTML = posterChoices.map((poster, index) => {
          const src = `${IMG_URL}${poster.file_path}`;
          const current = movie.posterImg === src ? ' current' : '';
          return `<button class="poster-option${current}" type="button" data-poster-index="${index}" aria-label="เลือกโปสเตอร์แบบที่ ${index + 1}">
            <img src="${src}" alt="" loading="lazy" decoding="async">
          </button>`;
        }).join('');
      } catch (error) {
        $('posterPickerGrid').innerHTML = '<div class="poster-picker-status">ไม่สามารถโหลดโปสเตอร์ได้ในขณะนี้<br><small>กรุณาลองใหม่อีกครั้ง</small></div>';
      }
    }

    function applyPoster(index) {
      const movie = movies.find(m => m.id === inspectingMovieId);
      const poster = posterChoices[index];
      if (!movie || !poster) return;

      const posterUrl = `${IMG_URL}${poster.file_path}`;
      movie.posterImg = posterUrl;
      movie.updatedAt = new Date().toISOString();
      saveMoviesToStorage();
      renderCollection();
      $('inspectBgImg').src = posterUrl;
      $('inspectCoverImg').src = posterUrl;
      if (!IS_FILE_MODE && currentRoute() === 'posters') {
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(movie.id)}`;
        return;
      }
      $('posterPickerModal').close();
      showToast('เปลี่ยนโปสเตอร์เรียบร้อยแล้ว');
    }

    function openReviewEditor(asRoute = false) {
      if (!inspectingMovieId) {
        if (asRoute) goHome();
        return;
      }
      const movie = movies.find(m => m.id === inspectingMovieId);
      if (!movie) {
        if (asRoute) goHome();
        return;
      }

      if (!IS_FILE_MODE && !asRoute && currentRoute() !== 'review') {
        window.location.href = `${APP_ROUTES}/review/?id=${encodeURIComponent(movie.id)}`;
        return;
      }
      if ($('inspectModal').open) $('inspectModal').close();
      $('reviewMovieTitle').textContent = movie.title;
      $('reviewNoteInput').value = movie.note || '';
      $('reviewRatingVal').value = movie.rating || 0;
      updateReviewRatingStarsUI(movie.rating || 0);
      openAsPage($('reviewModal'));
    }

    function closeReviewEditor() {
      if (IS_FILE_MODE) {
        closeLocalPage($('reviewModal'));
        if (inspectingMovieId) openInspectDialog(inspectingMovieId, true);
      } else if (currentRoute() === 'review') {
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(inspectingMovieId || '')}`;
      } else {
        $('reviewModal').close();
      }
    }

    function saveReview(event) {
      event.preventDefault();
      const movie = movies.find(item => item.id === inspectingMovieId);
      if (!movie) return;
      movie.rating = Math.min(5, Math.max(0, Math.round((Number($('reviewRatingVal').value) || 0) * 2) / 2));
      movie.note = $('reviewNoteInput').value.trim();
      movie.updatedAt = new Date().toISOString();
      saveMoviesToStorage();
      renderCollection();
      if (!IS_FILE_MODE && currentRoute() === 'review') {
        sessionStorage.setItem('movie_memory_flash', '✓ แก้ไขรีวิวเรียบร้อยแล้ว');
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(movie.id)}`;
      } else {
        closeLocalPage($('reviewModal'));
        openInspectDialog(movie.id, true);
        showToast('✓ แก้ไขรีวิวเรียบร้อยแล้ว');
      }
    }

    function openRewatchDialog(asRoute = false) {
      const movie = movies.find(item => item.id === inspectingMovieId);
      if (!movie) {
        if (asRoute) goHome();
        return;
      }
      if (!IS_FILE_MODE && !asRoute && currentRoute() !== 'rewatch') {
        window.location.href = `${APP_ROUTES}/rewatch/?id=${encodeURIComponent(movie.id)}`;
        return;
      }
      if ($('inspectModal').open) $('inspectModal').close();
      $('rewatchMovieTitle').textContent = movie.title;
      $('rewatchDateInput').value = new Date().toISOString().slice(0, 10);
      $('rewatchFormatInput').value = movie.format || 'โรงภาพยนตร์';
      $('rewatchCinemaInput').value = '';
      $('rewatchSeatInput').value = '';
      $('rewatchCompanionInput').value = '';
      $('rewatchMemoryInput').value = '';
      $('rewatchTicketData').value = '';
      $('rewatchTicketPreviewImg').removeAttribute('src');
      $('rewatchTicketPreviewImg').hidden = true;
      $('rewatchTicketPreviewImg').style.display = 'none';
      $('rewatchTicketOverlay').style.display = 'block';
      openAsPage($('rewatchModal'));
    }

    function closeRewatchDialog() {
      if (IS_FILE_MODE) {
        closeLocalPage($('rewatchModal'));
        if (inspectingMovieId) openInspectDialog(inspectingMovieId, true);
      } else if (currentRoute() === 'rewatch') {
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(inspectingMovieId || '')}`;
      } else {
        $('rewatchModal').close();
      }
    }

    function saveRewatch(event) {
      event.preventDefault();
      const movie = movies.find(item => item.id === inspectingMovieId);
      if (!movie) return;
      const now = new Date().toISOString();
      const viewing = normalizeViewing({
        id: `v_${Date.now()}`,
        watchDate: $('rewatchDateInput').value,
        format: $('rewatchFormatInput').value,
        cinema: $('rewatchCinemaInput').value,
        seat: $('rewatchSeatInput').value,
        companion: $('rewatchCompanionInput').value,
        memory: $('rewatchMemoryInput').value,
        ticketImg: $('rewatchTicketData').value,
        createdAt: now
      });
      movie.viewings = [...(Array.isArray(movie.viewings) ? movie.viewings : []), viewing];
      syncLatestViewingFields(movie);
      movie.updatedAt = now;
      saveMoviesToStorage();
      renderCollection();
      if (!IS_FILE_MODE && currentRoute() === 'rewatch') {
        sessionStorage.setItem('movie_memory_flash', `✓ บันทึกการดูครั้งที่ ${movieWatchCount(movie)} แล้ว`);
        window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(movie.id)}`;
      } else {
        closeLocalPage($('rewatchModal'));
        openInspectDialog(movie.id, true);
        showToast(`✓ บันทึกการดูครั้งที่ ${movieWatchCount(movie)} แล้ว`);
      }
    }

    function deleteCurrentMovie() {
      const id = $('formMovieId').value;
      if (!id) return;
      const movie = movies.find(item => item.id === id);
      if (!movie || !confirmDeleteTap(movie, $('deleteEntryBtn'))) return;
      movies = movies.filter(m => m.id !== id);
      saveMoviesToStorage();
      renderCollection();
      resetDeleteConfirmation();
      if (currentRoute() === 'add') sessionStorage.setItem('movie_memory_flash', '🗑️ ลบบันทึกเรียบร้อยแล้ว');
      closeAddDialog();
      showToast('🗑️ ลบบันทึกเรียบร้อยแล้ว');
    }

    function resetDeleteConfirmation() {
      pendingDeleteMovieId = null;
      clearTimeout(pendingDeleteTimer);
      const inspectButton = $('inspectDeleteBtn');
      const editButton = $('deleteEntryBtn');
      if (inspectButton) {
        inspectButton.textContent = '🗑️ ลบหนัง';
        inspectButton.classList.remove('confirm-delete');
      }
      if (editButton) editButton.textContent = '🗑️ ลบบันทึกนี้';
    }

    function confirmDeleteTap(movie, button) {
      if (pendingDeleteMovieId === movie.id) return true;
      resetDeleteConfirmation();
      pendingDeleteMovieId = movie.id;
      button.textContent = 'ยืนยันลบหนัง';
      button.classList.add('confirm-delete');
      showToast('แตะ “ยืนยันลบหนัง” ภายใน 10 วินาที');
      pendingDeleteTimer = setTimeout(resetDeleteConfirmation, 10000);
      return false;
    }

    function deleteInspectedMovie() {
      const movie = movies.find(item => item.id === inspectingMovieId);
      if (!movie) return;
      if (!confirmDeleteTap(movie, $('inspectDeleteBtn'))) return;

      movies = movies.filter(item => item.id !== movie.id);
      saveMoviesToStorage();
      renderCollection();
      inspectingMovieId = null;
      resetDeleteConfirmation();

      if (!IS_FILE_MODE && currentRoute() === 'movie') {
        sessionStorage.setItem('movie_memory_flash', '🗑️ ลบหนังออกจากคอลเลกชันแล้ว');
        goHome();
      } else {
        if ($('inspectModal').open) $('inspectModal').close();
        document.body.classList.remove('route-page');
        showToast('🗑️ ลบหนังออกจากคอลเลกชันแล้ว');
      }
    }

    // Image Upload Handlers for Ticket Upload
    function handleImageFileSelect(file, targetHiddenInputId, targetPreviewImgId, targetOverlayId) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          $(targetHiddenInputId).value = compressedDataUrl;
          $(targetPreviewImgId).src = compressedDataUrl;
          $(targetPreviewImgId).style.display = 'block';
          $(targetOverlayId).style.display = 'none';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    // Event Listeners Setup
    document.addEventListener('DOMContentLoaded', () => {
      renderCollection();
      restoreFilterSettings();
      renderCollection();
      const flashMessage = sessionStorage.getItem('movie_memory_flash');
      if (flashMessage) {
        sessionStorage.removeItem('movie_memory_flash');
        setTimeout(() => showToast(flashMessage), 120);
      }

      const route = currentRoute();
      const routeParams = new URLSearchParams(window.location.search);
      if (route === 'add') {
        const editId = routeParams.get('edit');
        if (editId) {
          inspectingMovieId = editId;
          openReviewEditor(true);
        } else {
          openAddDialog(true);
        }
      } else if (route === 'movie') {
        openInspectDialog(routeParams.get('id'), true);
      } else if (route === 'posters') {
        inspectingMovieId = routeParams.get('id');
        openPosterPicker(true);
      } else if (route === 'rewatch') {
        inspectingMovieId = routeParams.get('id');
        openRewatchDialog(true);
      } else if (route === 'review') {
        inspectingMovieId = routeParams.get('id');
        openReviewEditor(true);
      } else if (route === 'settings') {
        document.body.classList.add('route-page');
      }

      // Modal Triggers
      $('openAddModalBtn').addEventListener('click', () => openAddDialog());
      $('mobileAddBtn').addEventListener('click', () => openAddDialog());
      $('closeModalBtn').addEventListener('click', closeAddDialog);
      $('cancelModalBtn').addEventListener('click', closeAddDialog);
      
      // Prominent Save Button Handler
      $('saveMovieBtn').addEventListener('click', executeSaveMovie);

      // Wizard Navigation
      $('choiceTmdbBtn').addEventListener('click', () => switchWizardStep(2));
      $('choiceCameraBtn').addEventListener('click', () => {
        resetForm();
        switchWizardStep(3);
        $('ticketFileInput').click();
      });
      $('backToStep1Btn').addEventListener('click', () => switchWizardStep(1));

      // Catalog Search Listener with Debounce
      $('catalogSearchInput').addEventListener('input', e => {
        clearTimeout(tmdbDebounceTimer);
        tmdbDebounceTimer = setTimeout(() => {
          fetchCatalogMovies(1, true);
        }, 350);
      });

      // Quick Chips Fillers
      document.querySelectorAll('[data-fill-cinema]').forEach(chip => {
        chip.addEventListener('click', () => {
          $('formCinemaInput').value = chip.dataset.fillCinema;
        });
      });

      document.querySelectorAll('[data-fill-companion]').forEach(chip => {
        chip.addEventListener('click', () => {
          $('formCompanionInput').value = chip.dataset.fillCompanion;
        });
      });

      // Interactive Rating Picker
      document.querySelectorAll('#ratingPicker .star-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const star = Number(btn.dataset.star);
          const current = Number($('formRatingVal').value) || 0;
          const r = current === star - 0.5 ? star : star - 0.5;
          $('formRatingVal').value = r;
          updateRatingStarsUI(r);
          const editingId = $('formMovieId').value;
          const editingMovie = movies.find(movie => movie.id === editingId);
          if (editingMovie) {
            editingMovie.rating = r;
            editingMovie.updatedAt = new Date().toISOString();
            saveMoviesToStorage();
            renderCollection();
            if (inspectingMovieId === editingMovie.id) $('inspectStarsTxt').textContent = formatStars(r);
          }
        });
      });
      document.querySelectorAll('#reviewRatingPicker .star-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const star = Number(btn.dataset.star);
          const current = Number($('reviewRatingVal').value) || 0;
          const rating = current === star - 0.5 ? star : star - 0.5;
          $('reviewRatingVal').value = rating;
          updateReviewRatingStarsUI(rating);
        });
      });

      // Poster Selection (Takes user to catalog search!)
      $('posterSelectZone').addEventListener('click', () => {
        switchWizardStep(2);
      });

      // Ticket Image Upload
      $('ticketUploadZone').addEventListener('click', () => $('ticketFileInput').click());
      $('ticketFileInput').addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
          handleImageFileSelect(e.target.files[0], 'formTicketData', 'ticketPreviewImg', 'ticketOverlayInfo');
        }
      });
      $('rewatchTicketUploadZone').addEventListener('click', () => $('rewatchTicketFileInput').click());
      $('rewatchTicketFileInput').addEventListener('change', event => {
        if (event.target.files?.[0]) {
          handleImageFileSelect(event.target.files[0], 'rewatchTicketData', 'rewatchTicketPreviewImg', 'rewatchTicketOverlay');
          $('rewatchTicketPreviewImg').hidden = false;
        }
      });

      // Filter & Toolbar Controls
      $('searchInput').addEventListener('input', () => {
        persistFilterSettings();
        renderCollection();
      });
      $('mobileFilterToggle').addEventListener('click', () => {
        const toolbar = document.querySelector('.toolbar');
        const expanded = toolbar.classList.toggle('filters-open');
        $('mobileFilterToggle').setAttribute('aria-expanded', String(expanded));
      });
      ['yearFilter', 'formatFilter', 'sortSelect'].forEach(id => {
        $(id).addEventListener('change', () => {
          persistFilterSettings();
          renderCollection();
        });
      });
      $('clearFiltersBtn').addEventListener('click', () => {
        resetFilterSettings();
        renderCollection();
      });
      $('collectionGrid').addEventListener('click', event => {
        const action = event.target.closest('[data-empty-action]');
        if (!action) return;
        if (action.dataset.emptyAction === 'clear') {
          $('clearFiltersBtn').click();
        } else {
          openAddDialog();
        }
      });
      $('collectionGrid').addEventListener('keydown', event => {
        const card = event.target.closest('[data-movie-id]');
        if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openInspectDialog(card.dataset.movieId);
      });

      // View Mode Toggle
      $('viewGridBtn').addEventListener('click', () => {
        currentViewMode = 'grid';
        localStorage.setItem('mm_view_mode', 'grid');
        renderCollection();
      });
      $('viewListBtn').addEventListener('click', () => {
        currentViewMode = 'list';
        localStorage.setItem('mm_view_mode', 'list');
        renderCollection();
      });
      $('viewTicketBtn').addEventListener('click', () => {
        currentViewMode = 'ticket';
        localStorage.setItem('mm_view_mode', 'ticket');
        renderCollection();
      });

      // Inspector Controls
      $('closeInspectBtn').addEventListener('click', () => IS_FILE_MODE ? closeLocalPage($('inspectModal')) : currentRoute() === 'movie' ? goHome() : $('inspectModal').close());
      $('inspectCloseBtn').addEventListener('click', () => IS_FILE_MODE ? closeLocalPage($('inspectModal')) : currentRoute() === 'movie' ? goHome() : $('inspectModal').close());
      $('inspectEditBtn').addEventListener('click', () => openReviewEditor());
      $('inspectRewatchBtn').addEventListener('click', () => openRewatchDialog());
      $('inspectDeleteBtn').addEventListener('click', deleteInspectedMovie);
      $('inspectShareBtn').addEventListener('click', openStoryEditor);
      $('closeStoryEditorBtn').addEventListener('click', closeStoryEditor);
      $('cancelStoryEditorBtn').addEventListener('click', closeStoryEditor);
      $('confirmStoryShareBtn').addEventListener('click', shareEditedStory);
      $('storyAverageColorBtn').addEventListener('click', () => setStoryBackground(storyEditorState.averageColor, 'average'));
      $('storyBackgroundColor').addEventListener('input', event => setStoryBackground(event.target.value, 'custom'));
      document.querySelectorAll('[data-story-color]').forEach(button => {
        button.addEventListener('click', () => setStoryBackground(button.dataset.storyColor, 'preset'));
      });
      $('storyEditorModal').addEventListener('cancel', event => {
        event.preventDefault();
        closeStoryEditor();
      });
      $('changePosterBtn').addEventListener('click', () => openPosterPicker());
      $('closePosterPickerBtn').addEventListener('click', () => {
        if (!IS_FILE_MODE && currentRoute() === 'posters' && inspectingMovieId) {
          window.location.href = `${APP_ROUTES}/movie/?id=${encodeURIComponent(inspectingMovieId)}`;
        } else {
          IS_FILE_MODE ? closeLocalPage($('posterPickerModal')) : $('posterPickerModal').close();
        }
      });
      $('posterPickerGrid').addEventListener('click', event => {
        const option = event.target.closest('[data-poster-index]');
        if (option) applyPoster(Number(option.dataset.posterIndex));
      });

      $('deleteEntryBtn').addEventListener('click', deleteCurrentMovie);
      $('rewatchForm').addEventListener('submit', saveRewatch);
      $('closeRewatchBtn').addEventListener('click', closeRewatchDialog);
      $('cancelRewatchBtn').addEventListener('click', closeRewatchDialog);
      $('reviewForm').addEventListener('submit', saveReview);
      $('closeReviewBtn').addEventListener('click', closeReviewEditor);
      $('cancelReviewBtn').addEventListener('click', closeReviewEditor);
    });
