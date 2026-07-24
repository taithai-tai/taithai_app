    const STORAGE_KEY = 'taithai_movie_memory_v2';
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

    function safeText(value, maxLength = 500) {
      return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
    }

    function safeImage(value) {
      const image = safeText(value, 1500000);
      return /^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(image) ? image : '';
    }

    function normalizeMovie(raw, index = 0) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const rawId = safeText(value.id, 80);
      const id = /^[a-zA-Z0-9_-]+$/.test(rawId) ? rawId : `m_${Date.now()}_${index}`;
      const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '';
      const allowedFormats = ['โรงภาพยนตร์', 'Streaming', 'แผ่น / Digital', 'เทศกาลหนัง', 'อื่น ๆ'];
      const format = allowedFormats.includes(value.format) ? value.format : 'โรงภาพยนตร์';
      const rating = Math.min(5, Math.max(0, Math.round(Number(value.rating) || 0)));

      return {
        id,
        tmdbId: Number.isInteger(Number(value.tmdbId)) && Number(value.tmdbId) > 0 ? Number(value.tmdbId) : null,
        title: safeText(value.title, 100) || 'บันทึกความทรงจำภาพยนตร์',
        watchDate: validDate(value.watchDate) ? value.watchDate : new Date().toISOString().slice(0, 10),
        releaseDate: validDate(value.releaseDate) ? value.releaseDate : '',
        format,
        cinema: safeText(value.cinema, 80),
        seat: safeText(value.seat, 40),
        companion: safeText(value.companion, 80),
        rating,
        note: safeText(value.note, 1000),
        posterImg: safeImage(value.posterImg || value.image),
        ticketImg: safeImage(value.ticketImg),
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
        window.dispatchEvent(new CustomEvent('movie-memory:changed', { detail: movies }));
      } catch (e) {
        showToast('⚠️ พื้นที่จัดเก็บเต็ม! ลองลดขนาดรูปภาพ');
      }
    }

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
      const num = Number(rating) || 0;
      if (!num) return '☆☆☆☆☆';
      return '★'.repeat(num) + '☆'.repeat(5 - num);
    }

    function getFilteredMovies() {
      const q = $('searchInput').value.trim().toLowerCase();
      const yr = $('yearFilter').value;
      const fmt = $('formatFilter').value;
      const sort = $('sortSelect').value;

      let list = movies.filter(m => {
        const combinedText = [m.title, m.cinema, m.seat, m.companion, m.note, m.format].join(' ').toLowerCase();
        const matchQuery = !q || combinedText.includes(q);
        const matchYear = yr === 'all' || (m.watchDate || '').startsWith(yr);
        const matchFormat = fmt === 'all' || (m.format || '').includes(fmt);
        return matchQuery && matchYear && matchFormat;
      });

      list.sort((a, b) => {
        if (sort === 'oldest') return (a.watchDate || '').localeCompare(b.watchDate || '');
        if (sort === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'th');
        return (b.watchDate || '').localeCompare(a.watchDate || '');
      });

      return list;
    }

    function updateStatsDashboard() {
      $('statTotal').textContent = movies.length;
      
      const currYr = String(new Date().getFullYear());
      $('currYearTxt').textContent = Number(currYr) + 543;
      const countThisYear = movies.filter(m => (m.watchDate || '').startsWith(currYr)).length;
      $('statYear').textContent = countThisYear;

      const rated = movies.filter(m => Number(m.rating) > 0);
      if (rated.length) {
        const avg = (rated.reduce((sum, m) => sum + Number(m.rating), 0) / rated.length).toFixed(1);
        $('statAvg').innerHTML = `${avg} <em>★</em>`;
      } else {
        $('statAvg').innerHTML = `<em>—</em>`;
      }

      // Top format
      const fmtCounts = {};
      movies.forEach(m => {
        const f = m.format || 'โรงภาพยนตร์';
        fmtCounts[f] = (fmtCounts[f] || 0) + 1;
      });
      let topFmt = '—';
      let maxC = 0;
      Object.keys(fmtCounts).forEach(f => {
        if (fmtCounts[f] > maxC) {
          maxC = fmtCounts[f];
          topFmt = f;
        }
      });
      if (topFmt !== '—') {
        $('statTopFormat').textContent = topFmt;
      } else {
        $('statTopFormat').innerHTML = `<em>—</em>`;
      }

      // Year filter options
      const yearFilter = $('yearFilter');
      const selectedYear = yearFilter.value;
      const years = [...new Set(movies.map(m => (m.watchDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
      
      yearFilter.innerHTML = '<option value="all">ทุกปี</option>' + years.map(y => `<option value="${y}">${Number(y) + 543}</option>`).join('');
      if (years.includes(selectedYear) || selectedYear === 'all') {
        yearFilter.value = selectedYear;
      }
    }

    function renderCollection() {
      const grid = $('collectionGrid');
      const filtered = getFilteredMovies();
      const filtersActive = Boolean(
        $('searchInput').value.trim() ||
        $('yearFilter').value !== 'all' ||
        $('formatFilter').value !== 'all'
      );

      $('resultSummary').textContent = movies.length
        ? filtersActive
          ? `พบ ${filtered.length} จาก ${movies.length} เรื่อง`
          : `${movies.length} เรื่อง · เก็บไว้เป็นความทรงจำแล้ว`
        : 'ยังไม่มีหนังในคอลเลกชัน';
      $('clearFiltersBtn').hidden = !filtersActive;

      grid.className = 'collection-grid';
      if (currentViewMode === 'list') grid.classList.add('list-view');
      if (currentViewMode === 'ticket') grid.classList.add('ticket-view');

      $('viewGridBtn').classList.toggle('active', currentViewMode === 'grid');
      $('viewListBtn').classList.toggle('active', currentViewMode === 'list');
      $('viewTicketBtn').classList.toggle('active', currentViewMode === 'ticket');

      updateStatsDashboard();

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
            <div class="ticket-stub-card" onclick="openInspectDialog('${m.id}')" role="button" tabindex="0" data-movie-id="${m.id}" aria-label="เปิดรายละเอียด ${escapeHtml(m.title)}">
              <div class="ticket-stub-top">
                <span class="ticket-cinema-badge">${escapeHtml(m.cinema || m.format || 'CINEMA')}</span>
                <span style="font-size:11px; color:var(--gold); font-weight:700">${formatDate(m.watchDate)}</span>
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
            <div class="movie-card" onclick="openInspectDialog('${m.id}')" role="button" tabindex="0" data-movie-id="${m.id}" aria-label="เปิดรายละเอียด ${escapeHtml(m.title)}">
              <div class="poster-bg">
                ${displayImg ? `<img src="${escapeHtml(displayImg)}" alt="${escapeHtml(m.title)}" loading="lazy" decoding="async">` : `<div class="no-poster-fill">🎬</div>`}
                <div class="poster-overlay"></div>
              </div>
              <div class="card-header">
                <span class="badge-format">${escapeHtml(m.format || 'โรงภาพยนตร์')}</span>
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
    function openAddDialog() {
      resetForm();
      $('modalHeaderTitle').textContent = 'เพิ่มความทรงจำหนังใหม่';
      $('deleteEntryBtn').style.display = 'none';
      switchWizardStep(1);
      $('addEditModal').showModal();
    }

    function closeAddDialog() {
      $('addEditModal').close();
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
        const results = data.results || [];

        if (reset) catalogMoviesList = [];
        catalogMoviesList = [...catalogMoviesList, ...results];

        if (catalogMoviesList.length === 0) {
          listGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--muted)">ไม่พบรายชื่อหนัง ลองค้นหาด้วยคำอื่น</div>';
          isCatalogLoading = false;
          return;
        }

        listGrid.innerHTML = catalogMoviesList.map(item => {
          const poster = item.poster_path ? `${IMG_URL}${item.poster_path}` : '';
          const yr = item.release_date ? item.release_date.slice(0, 4) : '';
          return `
            <div class="catalog-item-card" onclick="selectCatalogMovie(${item.id})">
              <div class="catalog-poster-thumb">
                ${poster ? `<img src="${poster}" class="vertical-aspect" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">` : `<div style="width:100%;height:100%;display:grid;place-items:center;color:var(--muted);font-size:24px">🎬</div>`}
              </div>
              <div class="catalog-item-info">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${yr ? `ปี ${yr}` : 'ภาพยนตร์'}</span>
              </div>
            </div>
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
      const btns = document.querySelectorAll('#ratingPicker .star-btn');
      btns.forEach((btn, idx) => {
        btn.classList.toggle('active', idx < rating);
      });
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
      const posterImg = $('formPosterData').value;
      const ticketImg = $('formTicketData').value;

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
        updatedAt: new Date().toISOString()
      };

      const existingIndex = movies.findIndex(m => m.id === id);
      if (existingIndex >= 0) {
        movies[existingIndex] = movieObj;
      } else {
        movies.unshift(movieObj);
      }

      saveMoviesToStorage();
      renderCollection();
      closeAddDialog();
      showToast('✨ บันทึกตั๋วภาพยนตร์เรียบร้อยแล้ว');
    }

    // Inspector modal
    function openInspectDialog(id) {
      const movie = movies.find(m => m.id === id);
      if (!movie) return;

      inspectingMovieId = id;
      const bgImg = movie.posterImg || movie.ticketImg || '';
      
      $('inspectBgImg').src = bgImg;
      $('inspectCoverImg').src = bgImg;
      $('inspectFormatBadge').textContent = movie.format || 'โรงภาพยนตร์';
      $('inspectTitleTxt').textContent = movie.title || 'ไม่มีชื่อ';
      $('inspectStarsTxt').textContent = formatStars(movie.rating);
      $('inspectNoteTxt').textContent = movie.note || 'ไม่มีรีวิวหรือความรู้สึกเพิ่มเติมในตั๋วใบนี้';
      $('inspectDateTxt').textContent = formatDate(movie.watchDate);
      $('inspectCinemaTxt').textContent = movie.cinema || 'ไม่ระบุสถานที่';
      $('inspectSeatTxt').textContent = movie.seat || 'ไม่ระบุที่นั่ง';
      $('inspectCompanionTxt').textContent = movie.companion || 'ดูคนเดียว';

      $('inspectModal').showModal();
    }

    async function openPosterPicker() {
      const movie = movies.find(m => m.id === inspectingMovieId);
      if (!movie) return;

      $('posterPickerTitle').textContent = movie.title;
      $('posterPickerGrid').innerHTML = '<div class="poster-picker-status">กำลังค้นหาโปสเตอร์จาก TMDB…</div>';
      $('posterPickerModal').showModal();

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
      $('posterPickerModal').close();
      showToast('เปลี่ยนโปสเตอร์เรียบร้อยแล้ว');
    }

    function editInspectedMovie() {
      if (!inspectingMovieId) return;
      const movie = movies.find(m => m.id === inspectingMovieId);
      if (!movie) return;

      $('inspectModal').close();
      
      $('formMovieId').value = movie.id;
      $('formTmdbId').value = movie.tmdbId || '';
      $('formReleaseDate').value = movie.releaseDate || '';
      $('formTitleInput').value = movie.title || '';
      $('formWatchDateInput').value = movie.watchDate || '';
      $('formFormatInput').value = movie.format || 'โรงภาพยนตร์';
      $('formCinemaInput').value = movie.cinema || '';
      $('formSeatInput').value = movie.seat || '';
      $('formCompanionInput').value = movie.companion || '';
      $('formNoteInput').value = movie.note || '';
      $('formRatingVal').value = movie.rating || 0;

      $('formPosterData').value = movie.posterImg || '';
      if (movie.posterImg) {
        $('posterPreviewImg').src = movie.posterImg;
        $('posterPreviewImg').style.display = 'block';
        $('posterOverlayInfo').style.display = 'block';
        $('posterOverlayInfo').innerHTML = '🎬<br><strong>เลือกโปสเตอร์นี้แล้ว</strong><br><small style="color:var(--gold)">🔍 คลิกเพื่อเปลี่ยนเรื่อง</small>';
      }

      $('formTicketData').value = movie.ticketImg || '';
      if (movie.ticketImg) {
        $('ticketPreviewImg').src = movie.ticketImg;
        $('ticketPreviewImg').style.display = 'block';
        $('ticketOverlayInfo').style.display = 'none';
      }

      updateRatingStarsUI(movie.rating || 0);

      $('modalHeaderTitle').textContent = 'แก้ไขบันทึกภาพยนตร์';
      $('deleteEntryBtn').style.display = 'inline-flex';

      switchWizardStep(3);
      $('addEditModal').showModal();
    }

    function deleteCurrentMovie() {
      const id = $('formMovieId').value;
      if (!id) return;

      if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบันทึกตั๋วหนังเรื่องนี้?')) {
        movies = movies.filter(m => m.id !== id);
        saveMoviesToStorage();
        renderCollection();
        closeAddDialog();
        showToast('🗑️ ลบบันทึกเรียบร้อยแล้ว');
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

      // Modal Triggers
      $('openAddModalBtn').addEventListener('click', openAddDialog);
      $('mobileAddBtn').addEventListener('click', openAddDialog);
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
          const r = Number(btn.dataset.star);
          $('formRatingVal').value = r;
          updateRatingStarsUI(r);
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

      // Filter & Toolbar Controls
      $('searchInput').addEventListener('input', renderCollection);
      $('yearFilter').addEventListener('change', renderCollection);
      $('formatFilter').addEventListener('change', renderCollection);
      $('sortSelect').addEventListener('change', renderCollection);
      $('clearFiltersBtn').addEventListener('click', () => {
        $('searchInput').value = '';
        $('yearFilter').value = 'all';
        $('formatFilter').value = 'all';
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
      $('closeInspectBtn').addEventListener('click', () => $('inspectModal').close());
      $('inspectCloseBtn').addEventListener('click', () => $('inspectModal').close());
      $('inspectEditBtn').addEventListener('click', editInspectedMovie);
      $('changePosterBtn').addEventListener('click', openPosterPicker);
      $('closePosterPickerBtn').addEventListener('click', () => $('posterPickerModal').close());
      $('posterPickerGrid').addEventListener('click', event => {
        const option = event.target.closest('[data-poster-index]');
        if (option) applyPoster(Number(option.dataset.posterIndex));
      });

      $('deleteEntryBtn').addEventListener('click', deleteCurrentMovie);
    });
