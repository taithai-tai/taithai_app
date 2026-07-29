(() => {
  const STORAGE_KEY = "taithai_movie_memory_v2";
  const API_KEY = "a7ee9f0641a8225ed2d6f0693de8507d";
  const BASE_URL = "https://api.themoviedb.org/3";
  const IMAGE_URL = "https://image.tmdb.org/t/p/w500";
  const $ = id => document.getElementById(id);
  const isFileMode = window.location.protocol === "file:";
  const detailsCache = new Map();
  let genreNames = new Map();
  let activeCollection = [];
  let activeLoadVersion = 0;
  let recommendationRound = 0;
  let lastCollectionSignature = "";
  let stopCloudUpdates = () => {};

  function readLocalMovies() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem("taithai_movie_memory_v1") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function safeText(value, maxLength = 160) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeTitle(value) {
    return safeText(value).toLocaleLowerCase("th").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function watchCount(movie) {
    return Math.max(1, Array.isArray(movie?.viewings) ? movie.viewings.length : 0);
  }

  function collectionSignature(movies) {
    return movies.map(movie => [
      movie.id,
      movie.tmdbId,
      movie.title,
      movie.releaseDate,
      movie.rating,
      movie.updatedAt
    ].join(":")).sort().join("|");
  }

  async function fetchJson(path, params = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const language = window.MovieMemoryPreferences?.get().language === "en" ? "en-US" : "th-TH";
    const query = new URLSearchParams({ api_key: API_KEY, language, ...params });
    try {
      const response = await fetch(`${BASE_URL}${path}?${query.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`TMDB_${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadGenreNames() {
    if (genreNames.size) return genreNames;
    const data = await fetchJson("/genre/movie/list");
    genreNames = new Map((data.genres || []).map(genre => [Number(genre.id), safeText(genre.name, 60)]));
    return genreNames;
  }

  async function resolveMovieDetails(movie) {
    const savedId = Number(movie?.tmdbId);
    const cacheKey = savedId > 0 ? `id:${savedId}` : `title:${normalizeTitle(movie?.title)}`;
    if (detailsCache.has(cacheKey)) return detailsCache.get(cacheKey);

    let tmdbId = savedId > 0 ? savedId : null;
    if (!tmdbId && movie?.title) {
      const searchParams = { query: safeText(movie.title, 120), include_adult: "false", page: "1" };
      const releaseYear = safeText(movie.releaseDate, 10).slice(0, 4);
      if (/^\d{4}$/.test(releaseYear)) searchParams.year = releaseYear;
      let search = await fetchJson("/search/movie", searchParams);
      if (!search.results?.length && searchParams.year) {
        delete searchParams.year;
        search = await fetchJson("/search/movie", searchParams);
      }
      const normalized = normalizeTitle(movie.title);
      const exact = (search.results || []).find(item =>
        normalizeTitle(item.title) === normalized || normalizeTitle(item.original_title) === normalized
      );
      tmdbId = Number(exact?.id || search.results?.[0]?.id) || null;
    }
    if (!tmdbId) return null;

    const details = await fetchJson(`/movie/${tmdbId}`);
    detailsCache.set(cacheKey, details);
    detailsCache.set(`id:${tmdbId}`, details);
    return details;
  }

  function addCandidates(target, results, source) {
    (Array.isArray(results) ? results : []).forEach(movie => {
      const id = Number(movie?.id);
      if (!id || !movie.title) return;
      const current = target.get(id) || { ...movie, sources: [], sourceTitles: [] };
      current.sources.push(source.type);
      if (source.title) current.sourceTitles.push(source.title);
      target.set(id, current);
    });
  }

  function seededNoise(id, round) {
    const value = Math.sin((Number(id) + 17) * (round + 3) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function personalizeScore(movie, genreScores, round) {
    const genreAffinity = (movie.genre_ids || []).reduce((sum, id) => sum + Math.max(0, genreScores.get(Number(id)) || 0), 0);
    const sourceBonus = movie.sources.includes("favorite") ? 28
      : movie.sources.includes("taste") ? 18
        : movie.sources.includes("new") ? 8
          : 3;
    const quality = Math.min(24, (Number(movie.vote_average) || 0) * 2.4);
    const confidence = Math.min(9, Math.log10(Math.max(1, Number(movie.vote_count) || 0)) * 2.4);
    const popularity = Math.min(10, Math.log1p(Math.max(0, Number(movie.popularity) || 0)) * 1.6);
    return sourceBonus + genreAffinity * 4.4 + quality + confidence + popularity + seededNoise(movie.id, round) * 4;
  }

  function generalScore(movie, round) {
    const quality = Math.min(26, (Number(movie.vote_average) || 0) * 2.6);
    const confidence = Math.min(10, Math.log10(Math.max(1, Number(movie.vote_count) || 0)) * 2.8);
    const popularity = Math.min(14, Math.log1p(Math.max(0, Number(movie.popularity) || 0)) * 2);
    return quality + confidence + popularity + seededNoise(movie.id, round) * 18;
  }

  function reasonFor(movie, personalized, topGenres) {
    if (personalized && movie.sources.includes("favorite") && movie.sourceTitles.length) {
      return `เพราะคุณชอบ “${movie.sourceTitles[0]}”`;
    }
    if (personalized && movie.sources.includes("taste")) {
      const matching = (movie.genre_ids || []).map(id => genreNames.get(Number(id))).find(Boolean);
      return matching ? `ตรงกับแนว ${matching} ที่คุณให้คะแนนดี` : "ตรงกับรสนิยมการดูหนังของคุณ";
    }
    if (movie.sources.includes("new")) return "หนังใหม่ที่กำลังเข้าฉาย";
    if (movie.sources.includes("upcoming")) return "หนังที่กำลังจะเข้าฉาย";
    if (personalized && topGenres.length) return `ใกล้เคียงกับแนว ${genreNames.get(topGenres[0][0]) || "ที่คุณชอบ"}`;
    return "เรื่องน่าสนใจที่กำลังได้รับความนิยม";
  }

  function movieYear(movie) {
    return safeText(movie.release_date, 10).slice(0, 4) || "—";
  }

  function renderTasteProfile(profile) {
    if (!profile.personalized || !profile.topGenres.length) {
      $("tastePanel").hidden = true;
      return;
    }
    const names = profile.topGenres
      .map(([id]) => genreNames.get(Number(id)))
      .filter(Boolean)
      .slice(0, 4);
    $("tasteGenres").innerHTML = names.map(name => `<span class="taste-genre">${escapeHtml(name)}</span>`).join("");
    $("tasteExplanation").textContent = `วิเคราะห์จาก ${profile.ratedCount} เรื่องที่คุณให้คะแนน โดยให้น้ำหนักกับเรื่องที่ได้ 3.5 ดาวขึ้นไปมากที่สุด`;
    $("tastePanel").hidden = false;
  }

  function renderRecommendations(movies, profile, sourceText) {
    const addBase = isFileMode ? "./index.html" : "/Movie-Memory/add/";
    $("recommendationGrid").innerHTML = movies.map((movie, index) => {
      const poster = safeText(movie.poster_path, 160);
      const title = safeText(movie.title, 140) || "ไม่มีชื่อ";
      const genres = (movie.genre_ids || [])
        .map(id => genreNames.get(Number(id)))
        .filter(Boolean)
        .slice(0, 2);
      const addLink = `${addBase}?tmdb=${encodeURIComponent(movie.id)}`;
      const tmdbLink = `https://www.themoviedb.org/movie/${encodeURIComponent(movie.id)}`;
      const vote = Number(movie.vote_average) > 0 ? Number(movie.vote_average).toFixed(1) : "—";
      return `
        <article class="recommendation-card">
          <a class="recommendation-poster" href="${tmdbLink}" target="_blank" rel="noopener noreferrer" aria-label="ดูข้อมูล ${escapeHtml(title)} บน TMDB">
            ${poster
              ? `<img src="${IMAGE_URL}${escapeHtml(poster)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">`
              : '<span class="recommendation-poster-placeholder">🎬</span>'}
            <span class="recommendation-rank">#${index + 1}</span>
          </a>
          <div class="recommendation-copy">
            <small class="recommendation-reason">${escapeHtml(reasonFor(movie, profile.personalized, profile.topGenres))}</small>
            <h3>${escapeHtml(title)}</h3>
            <div class="recommendation-meta"><strong>${escapeHtml(movieYear(movie))}</strong><span>★ ${escapeHtml(vote)}</span></div>
            <div class="recommendation-genres">${genres.map(name => `<span class="recommendation-genre">${escapeHtml(name)}</span>`).join("")}</div>
            <div class="recommendation-actions">
              <a class="primary" href="${addLink}">＋ บันทึกหลังดู</a>
              <a href="${tmdbLink}" target="_blank" rel="noopener noreferrer" aria-label="รายละเอียดบน TMDB">↗</a>
            </div>
          </div>
        </article>`;
    }).join("");
    $("recommendationGrid").hidden = false;
    $("recommendationError").hidden = true;
    $("recommendationSource").textContent = sourceText;
  }

  function setLoading(message = "กำลังคัดหนังชุดใหม่…") {
    $("refreshRecommendationsBtn").disabled = true;
    $("recommendationError").hidden = true;
    $("recommendationGrid").hidden = false;
    $("recommendationGrid").innerHTML = Array.from({ length: 4 }, () => '<article class="recommendation-skeleton"></article>').join("");
    $("recommendationSource").textContent = message;
  }

  function showError() {
    $("refreshRecommendationsBtn").disabled = false;
    $("recommendationGrid").hidden = true;
    $("recommendationError").hidden = false;
    $("recommendationSource").textContent = "เชื่อมต่อ TMDB ไม่สำเร็จ";
  }

  async function createRecommendations(collection, sourceLabel) {
    const version = ++activeLoadVersion;
    const movies = Array.isArray(collection) ? collection : [];
    setLoading();
    const genreNamesPromise = loadGenreNames();

    const ratedMovies = movies
      .filter(movie => Number(movie.rating) > 0)
      .sort((a, b) => Number(b.rating) - Number(a.rating) || watchCount(b) - watchCount(a))
      .slice(0, 8);
    const resolvedRated = (await Promise.all(ratedMovies.map(async movie => {
      try {
        const details = await resolveMovieDetails(movie);
        return details ? { movie, details } : null;
      } catch {
        return null;
      }
    }))).filter(Boolean);
    await genreNamesPromise;

    const genreScores = new Map();
    resolvedRated.forEach(({ movie, details }) => {
      const rating = Number(movie.rating) || 0;
      const ratingWeight = rating >= 3.5 ? 0.8 + (rating - 3.5) * 1.4 : (rating - 3) * 0.45;
      const repeatWeight = 1 + Math.min(3, watchCount(movie) - 1) * 0.12;
      (details.genres || []).forEach(genre => {
        genreScores.set(Number(genre.id), (genreScores.get(Number(genre.id)) || 0) + ratingWeight * repeatWeight);
      });
    });
    const topGenres = [...genreScores.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const favorites = resolvedRated.filter(({ movie }) => Number(movie.rating) >= 3.5).slice(0, 3);
    const personalized = favorites.length > 0 && topGenres.length > 0;
    const candidateMap = new Map();
    const page = String(recommendationRound % 3 + 1);

    const candidateTasks = [
      fetchJson("/movie/now_playing", { page, region: "TH" })
        .then(data => addCandidates(candidateMap, data.results, { type: "new" }))
        .catch(() => {}),
      fetchJson("/movie/popular", { page })
        .then(data => addCandidates(candidateMap, data.results, { type: "popular" }))
        .catch(() => {}),
      fetchJson("/movie/upcoming", { page, region: "TH" })
        .then(data => addCandidates(candidateMap, data.results, { type: "upcoming" }))
        .catch(() => {})
    ];

    if (personalized) {
      candidateTasks.push(
        Promise.all(favorites.map(async ({ movie, details }) => {
          try {
            const data = await fetchJson(`/movie/${details.id}/recommendations`, { page });
            return { results: data.results, title: safeText(movie.title, 100) };
          } catch {
            return { results: [], title: safeText(movie.title, 100) };
          }
        })).then(results => {
          results.forEach(result => addCandidates(candidateMap, result.results, { type: "favorite", title: result.title }));
        }),
        fetchJson("/discover/movie", {
          sort_by: "popularity.desc",
          include_adult: "false",
          include_video: "false",
          page,
          "vote_count.gte": "80",
          with_genres: topGenres.slice(0, 3).map(([id]) => id).join("|")
        }).then(data => addCandidates(candidateMap, data.results, { type: "taste" })).catch(() => {})
      );
    }
    await Promise.all(candidateTasks);

    const watchedIds = new Set(movies.map(movie => Number(movie.tmdbId)).filter(id => id > 0));
    resolvedRated.forEach(({ details }) => watchedIds.add(Number(details.id)));
    const watchedTitles = new Set(movies.map(movie => normalizeTitle(movie.title)).filter(Boolean));
    const ranked = [...candidateMap.values()]
      .filter(movie => !watchedIds.has(Number(movie.id)) && !watchedTitles.has(normalizeTitle(movie.title)))
      .filter(movie => safeText(movie.release_date, 10) || Number(movie.popularity) > 0)
      .map(movie => ({
        ...movie,
        recommendationScore: personalized
          ? personalizeScore(movie, genreScores, recommendationRound)
          : generalScore(movie, recommendationRound)
      }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 20);

    if (version !== activeLoadVersion) return;
    if (!ranked.length) throw new Error("NO_RECOMMENDATIONS");

    const profile = { personalized, ratedCount: ratedMovies.length, topGenres };
    renderTasteProfile(profile);
    renderRecommendations(
      ranked,
      profile,
      personalized
        ? `ปรับจากคะแนนของคุณ · ${sourceLabel}`
        : `หนังใหม่และหนังยอดนิยม · ${sourceLabel}`
    );
    $("recommendationHeading").textContent = personalized ? "คัดมาให้จากรสนิยมของคุณ" : "หนังน่าดูช่วงนี้";
    $("recommendationSummary").classList.add("ready");
    $("recommendationSummary").innerHTML = `<span>${personalized
      ? `✓ ใช้คะแนน ${ratedMovies.length} เรื่องเพื่อจัดคำแนะนำนี้`
      : movies.length
        ? "ยังไม่มีคะแนนเพียงพอ จึงแนะนำจากหนังใหม่และหนังยอดนิยม"
        : "ยังไม่มีคอลเลกชัน จึงเริ่มจากหนังใหม่และหนังยอดนิยม"}</span>`;
    $("refreshRecommendationsBtn").disabled = false;
  }

  async function loadForCollection(collection, sourceLabel, force = false) {
    const movies = Array.isArray(collection) ? collection : [];
    const signature = collectionSignature(movies);
    activeCollection = movies;
    if (!force && signature === lastCollectionSignature) return;
    lastCollectionSignature = signature;
    const expectedVersion = activeLoadVersion + 1;
    try {
      await createRecommendations(movies, sourceLabel);
    } catch {
      if (activeLoadVersion === expectedVersion) showError();
    }
  }

  function showSignedOut() {
    $("recommendationAccount").hidden = true;
    $("recommendationLoginBtn").hidden = false;
  }

  function showAccount(user) {
    $("recommendationLoginBtn").hidden = true;
    $("recommendationAccount").hidden = false;
    $("recommendationAvatar").src = user.photoURL || "";
    $("recommendationUserName").textContent = user.displayName || user.email || "บัญชีของฉัน";
  }

  $("refreshRecommendationsBtn").addEventListener("click", () => {
    recommendationRound += 1;
    loadForCollection(activeCollection, "สุ่มชุดใหม่แล้ว", true);
  });
  $("retryRecommendationsBtn").addEventListener("click", () => {
    recommendationRound += 1;
    loadForCollection(activeCollection, "ลองเชื่อมต่ออีกครั้ง", true);
  });

  loadForCollection(readLocalMovies(), isFileMode ? "ข้อมูลในอุปกรณ์นี้" : "กำลังตรวจสอบบัญชี…", true);

  if (isFileMode) {
    $("recommendationLoginBtn").hidden = true;
    return;
  }

  import("/firebase-auth.js?v=20260728-2").then(authApi => {
    $("recommendationLoginBtn").addEventListener("click", async () => {
      const feedback = window.MovieMemoryAuthFeedback;
      try {
        $("recommendationLoginBtn").disabled = true;
        feedback?.show();
        await authApi.loginWithGoogle();
        feedback?.setStage("finishing");
        window.setTimeout(() => feedback?.hide(), 650);
      } catch (error) {
        if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") feedback?.hide();
        else feedback?.error();
      } finally {
        $("recommendationLoginBtn").disabled = false;
      }
    });

    authApi.subscribeAuth(async user => {
      stopCloudUpdates();
      stopCloudUpdates = () => {};
      if (!user) {
        showSignedOut();
        loadForCollection(readLocalMovies(), "ข้อมูลในอุปกรณ์นี้");
        return;
      }
      showAccount(user);
      try {
        const cloud = await authApi.getMyMovieCollection(user);
        const collection = cloud.exists ? cloud.movies : readLocalMovies();
        loadForCollection(collection, cloud.exists ? "คอลเลกชันล่าสุดจากบัญชี" : "ข้อมูลในอุปกรณ์นี้");
        stopCloudUpdates = authApi.subscribeMyMovieCollection(user, latestMovies => {
          loadForCollection(latestMovies, "อัปเดตจากบัญชีอัตโนมัติ");
        });
      } catch {
        loadForCollection(readLocalMovies(), "ข้อมูลในอุปกรณ์นี้");
      }
    });
  }).catch(() => {
    showSignedOut();
  });
})();
