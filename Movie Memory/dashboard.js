(() => {
  const STORAGE_KEY = "taithai_movie_memory_v2";
  const $ = id => document.getElementById(id);
  let stopCloudUpdates = () => {};

  function readLocalMovies() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem("taithai_movie_memory_v1") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function viewingsFor(movie) {
    if (Array.isArray(movie?.viewings) && movie.viewings.length) return movie.viewings;
    return [{
      watchDate: movie?.watchDate || "",
      format: movie?.format || "โรงภาพยนตร์"
    }];
  }

  function countBy(items, getKey) {
    return items.reduce((counts, item) => {
      const key = getKey(item);
      if (key) counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function renderBreakdown(element, counts, formatLabel = value => value) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maximum = Math.max(1, ...entries.map(([, count]) => count));
    element.replaceChildren();
    if (!entries.length) {
      const message = document.createElement("p");
      message.className = "sync-note";
      message.textContent = "ยังไม่มีข้อมูล";
      element.append(message);
      return;
    }
    entries.forEach(([label, count]) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      const name = document.createElement("span");
      name.className = "breakdown-label";
      name.textContent = formatLabel(label);
      const track = document.createElement("span");
      track.className = "breakdown-track";
      const bar = document.createElement("i");
      bar.style.setProperty("--bar-size", `${Math.max(6, count / maximum * 100)}%`);
      track.append(bar);
      const value = document.createElement("strong");
      value.className = "breakdown-count";
      value.textContent = String(count);
      row.append(name, track, value);
      element.append(row);
    });
  }

  function renderDashboard(collection, sourceText) {
    const movies = Array.isArray(collection) ? collection : [];
    const viewings = movies.flatMap(viewingsFor);
    const currentYear = String(new Date().getFullYear());
    const rated = movies.map(movie => Number(movie.rating)).filter(rating => rating > 0);
    const formatCounts = countBy(viewings, viewing => viewing.format || "โรงภาพยนตร์");
    const yearCounts = countBy(viewings, viewing => String(viewing.watchDate || "").slice(0, 4));
    const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    $("dashMovieCount").textContent = String(movies.length);
    $("dashWatchCount").textContent = String(viewings.length);
    $("dashYearCount").textContent = String(yearCounts[currentYear] || 0);
    $("dashCurrentYear").textContent = String(Number(currentYear) + 543);
    $("dashAverage").textContent = rated.length
      ? (rated.reduce((sum, rating) => sum + rating, 0) / rated.length).toFixed(1)
      : "—";
    $("dashTopFormat").textContent = topFormat;
    renderBreakdown($("yearBreakdown"), yearCounts, year => String(Number(year) + 543));
    renderBreakdown($("formatBreakdown"), formatCounts);

    $("dashboardStats").hidden = movies.length === 0;
    $("dashboardPanels").hidden = movies.length === 0;
    $("dashboardEmpty").hidden = movies.length > 0;
    $("dashboardSyncNote").textContent = sourceText;
    $("dashboardSyncNote").classList.toggle("ready", movies.length > 0);
  }

  function showSignedOut() {
    $("dashboardAccount").hidden = true;
    $("dashboardLoginBtn").hidden = false;
    renderDashboard(readLocalMovies(), "แสดงข้อมูลที่บันทึกไว้ในอุปกรณ์นี้ · เข้าสู่ระบบเพื่อดูข้อมูลของบัญชี");
  }

  function showAccount(user) {
    $("dashboardLoginBtn").hidden = true;
    $("dashboardAccount").hidden = false;
    $("dashboardAvatar").src = user.photoURL || "";
    $("dashboardUserName").textContent = user.displayName || user.email || "บัญชีของฉัน";
  }

  renderDashboard(readLocalMovies(), window.location.protocol === "file:"
    ? "แสดงข้อมูลจากไฟล์ในอุปกรณ์นี้"
    : "กำลังตรวจสอบบัญชีและข้อมูลล่าสุด…");

  if (window.location.protocol === "file:") return;

  import("/firebase-auth.js?v=20260728-1").then(authApi => {
    $("dashboardLoginBtn").addEventListener("click", async () => {
      try {
        $("dashboardLoginBtn").disabled = true;
        await authApi.loginWithGoogle();
      } catch {
        $("dashboardSyncNote").textContent = "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
      } finally {
        $("dashboardLoginBtn").disabled = false;
      }
    });

    authApi.subscribeAuth(async user => {
      stopCloudUpdates();
      stopCloudUpdates = () => {};
      if (!user) {
        showSignedOut();
        return;
      }
      showAccount(user);
      $("dashboardSyncNote").textContent = "กำลังโหลดคอลเลกชันล่าสุดจากบัญชี…";
      try {
        const cloud = await authApi.getMyMovieCollection(user);
        const initialMovies = cloud.exists ? cloud.movies : readLocalMovies();
        renderDashboard(initialMovies, cloud.exists
          ? "อัปเดตจากบัญชีของคุณแล้ว"
          : "ยังไม่มีข้อมูลบนบัญชี จึงแสดงข้อมูลจากอุปกรณ์นี้");
        stopCloudUpdates = authApi.subscribeMyMovieCollection(user, latestMovies => {
          renderDashboard(latestMovies, "อัปเดตข้อมูลจากบัญชีของคุณแบบอัตโนมัติ");
        });
      } catch {
        renderDashboard(readLocalMovies(), "เชื่อมต่อบัญชีไม่ได้ชั่วคราว · แสดงข้อมูลจากอุปกรณ์นี้");
      }
    });
  }).catch(() => {
    showSignedOut();
    $("dashboardSyncNote").textContent = "เชื่อมต่อระบบบัญชีไม่ได้ชั่วคราว · แสดงข้อมูลจากอุปกรณ์นี้";
  });
})();
