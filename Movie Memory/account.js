    import {
      loginWithGoogle,
      logout,
      subscribeAuth,
      getMyPublicProfile,
      claimUsername,
      searchPublicProfiles,
      getPublicProfile,
      publishMovieCollection
    } from "../firebase-auth.js?v=20260725-7";

    const loginBtn = document.getElementById("googleLoginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userProfileBar = document.getElementById("userProfileBar");
    const userAvatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    const userEmail = document.getElementById("userEmail");
    const peopleSearchWrap = document.getElementById("peopleSearchWrap");
    const peopleSearchInput = document.getElementById("peopleSearchInput");
    const peopleSearchResults = document.getElementById("peopleSearchResults");
    const profileModal = document.getElementById("profileModal");
    const profileSetup = document.getElementById("profileSetup");
    const publicProfileView = document.getElementById("publicProfileView");
    let signedInUser = null;
    let myProfile = null;
    let peopleSearchTimer = null;
    let movieSyncTimer = null;
    const profileSearchCache = new Map();
    const usernameCacheKey = uid => `movie_memory_username_${uid}`;
    const movieSyncKey = uid => `movie_memory_public_sync_v2_${uid}`;

    function publicMovieFingerprint(collection) {
      return JSON.stringify((Array.isArray(collection) ? collection : []).map(movie => [
        movie.id, movie.title, movie.tmdbId, movie.watchDate, movie.releaseDate,
        movie.format, movie.cinema, movie.rating,
        /^https:\/\//.test(movie.posterImg || "") ? movie.posterImg : ""
      ]));
    }

    async function syncMoviesIfNeeded(user, collection) {
      if (!user) return;
      const fingerprint = publicMovieFingerprint(collection);
      if (localStorage.getItem(movieSyncKey(user.uid)) === fingerprint) return;
      await publishMovieCollection(user, collection);
      localStorage.setItem(movieSyncKey(user.uid), fingerprint);
    }

    function openUsernameSetup() {
      if (!signedInUser) return;
      document.getElementById("profileModalTitle").textContent = "ตั้งไอดีของคุณ";
      profileSetup.hidden = false;
      publicProfileView.hidden = true;
      document.getElementById("usernameInput").value = myProfile?.username || "";
      profileModal.showModal();
    }

    function renderPublicMovies(publicMovies) {
      const list = Array.isArray(publicMovies) ? publicMovies : [];
      document.getElementById("socialMovies").innerHTML = list.length ? list.map(movie => `
        <article class="social-movie">
          ${movie.posterImg
            ? `<img src="${escapeHtml(movie.posterImg)}" alt="${escapeHtml(movie.title)}" loading="lazy" decoding="async">`
            : '<div class="social-movie-placeholder">🎬</div>'}
          <div class="social-movie-info">
            <strong>${escapeHtml(movie.title || "ไม่มีชื่อหนัง")}</strong>
            <small>${formatDate(movie.watchDate)} · ${formatStars(movie.rating)}</small>
          </div>
        </article>
      `).join("") : `
        <div class="social-profile-empty">
          <span>🎞️</span>
          <strong>ยังไม่มีรายการหนังที่แชร์</strong>
          <small>เมื่อเจ้าของบัญชีเปิดแอป รายการหนังจะซิงก์มาแสดงที่นี่</small>
        </div>`;
    }

    async function openPublicProfile(profile) {
      if (!profile?.uid) {
        showToast("เปิดโปรไฟล์นี้ไม่สำเร็จ");
        return;
      }
      peopleSearchResults.hidden = true;
      peopleSearchInput.value = "";
      document.getElementById("profileModalTitle").textContent = "Movie Memory";
      profileSetup.hidden = true;
      publicProfileView.hidden = false;
      document.getElementById("socialAvatar").src = profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`;
      document.getElementById("socialName").textContent = profile.displayName || profile.username || "Movie Memory";
      document.getElementById("socialUsername").textContent = profile.username ? `@${profile.username}` : "";
      renderPublicMovies(profile.publicMovies);
      if (!profileModal.open) profileModal.showModal();

      if (!Array.isArray(profile.publicMovies)) {
        try {
          const fresh = await getPublicProfile(profile.uid);
          renderPublicMovies(fresh.movies);
        } catch (error) {
          console.warn("Could not refresh this public profile:", error);
        }
      }
    }

    document.getElementById("closeProfileBtn").addEventListener("click", () => profileModal.close());
    userProfileBar.addEventListener("click", event => {
      if (event.target.closest("#logoutBtn")) return;
      if (myProfile?.username) {
        openPublicProfile({
          ...myProfile,
          uid: signedInUser.uid,
          displayName: signedInUser.displayName,
          photoURL: signedInUser.photoURL,
          publicMovies: movies
        });
      } else {
        openUsernameSetup();
      }
    });
    userProfileBar.style.cursor = "pointer";

    document.getElementById("saveUsernameBtn").addEventListener("click", async () => {
      const button = document.getElementById("saveUsernameBtn");
      try {
        button.disabled = true;
        const username = await claimUsername(signedInUser, document.getElementById("usernameInput").value);
        myProfile = { ...(myProfile || {}), username };
        localStorage.setItem(usernameCacheKey(signedInUser.uid), username);
        userEmail.textContent = `@${username}`;
        profileModal.close();
        showToast("✓ ตั้งไอดีเรียบร้อยแล้ว");
      } catch (error) {
        const message = error.message === "USERNAME_TAKEN"
          ? "ไอดีนี้มีคนใช้แล้ว"
          : "ไอดีต้องยาว 3–24 ตัว และใช้ตัวอักษร ตัวเลข จุด หรือขีดล่าง";
        showToast(message);
      } finally {
        button.disabled = false;
      }
    });

    peopleSearchInput.addEventListener("input", () => {
      clearTimeout(peopleSearchTimer);
      peopleSearchTimer = setTimeout(async () => {
        const term = peopleSearchInput.value.trim();
        if (!term) {
          peopleSearchResults.hidden = true;
          return;
        }
        try {
          const profiles = await searchPublicProfiles(term);
          profileSearchCache.clear();
          profiles.forEach(profile => profileSearchCache.set(profile.uid, profile));
          peopleSearchResults.innerHTML = profiles.length ? profiles.map(profile => `
            <button class="people-result" type="button" data-profile-uid="${escapeHtml(profile.uid)}" data-profile-username="${escapeHtml(profile.username)}">
              <img src="${escapeHtml(profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`)}" alt="" loading="lazy" decoding="async">
              <span><strong>${escapeHtml(profile.displayName || profile.username)}</strong><small>@${escapeHtml(profile.username)}</small></span>
            </button>
          `).join("") : '<div style="padding:14px;color:var(--muted)">ไม่พบบัญชีนี้</div>';
          peopleSearchResults.hidden = false;
        } catch {
          peopleSearchResults.innerHTML = '<div style="padding:14px;color:var(--muted)">ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง</div>';
          peopleSearchResults.hidden = false;
        }
      }, 350);
    });
    peopleSearchResults.addEventListener("click", event => {
      const result = event.target.closest("[data-profile-uid]");
      if (result) openPublicProfile(profileSearchCache.get(result.dataset.profileUid));
    });
    document.addEventListener("click", event => {
      if (!peopleSearchWrap.contains(event.target)) peopleSearchResults.hidden = true;
    });

    window.addEventListener("movie-memory:changed", event => {
      clearTimeout(movieSyncTimer);
      movieSyncTimer = setTimeout(() => {
        if (signedInUser) syncMoviesIfNeeded(signedInUser, event.detail).catch(() => {
          showToast("บันทึกในเครื่องแล้ว แต่ซิงก์โปรไฟล์ไม่สำเร็จ");
        });
      }, 500);
    });

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        try {
          loginBtn.style.opacity = "0.7";
          loginBtn.disabled = true;
          await loginWithGoogle();
        } catch (err) {
          console.error("Google Login Error:", err);
          const detail = err?.code ? ` (${err.code})` : '';
          showToast(`เข้าสู่ระบบไม่สำเร็จ${detail}`);
        } finally {
          loginBtn.style.opacity = "1";
          loginBtn.disabled = false;
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await logout();
        } catch (err) {
          console.error("Logout Error:", err);
        }
      });
    }

    subscribeAuth(async (user) => {
      signedInUser = user;
      if (user) {
        if (loginBtn) loginBtn.style.display = "none";
        if (userProfileBar) userProfileBar.style.display = "inline-flex";

        const name = user.displayName || user.email || "User";
        const photo = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        if (userAvatar) userAvatar.src = photo;
        if (userName) userName.textContent = name;
        if (peopleSearchWrap) peopleSearchWrap.style.display = "block";
        const cachedUsername = localStorage.getItem(usernameCacheKey(user.uid));
        if (cachedUsername) {
          myProfile = { uid: user.uid, username: cachedUsername };
          if (userEmail) userEmail.textContent = `@${cachedUsername}`;
        }
        try {
          myProfile = await getMyPublicProfile(user);
          if (myProfile?.username) {
            localStorage.setItem(usernameCacheKey(user.uid), myProfile.username);
            if (userEmail) userEmail.textContent = `@${myProfile.username}`;
          } else if (cachedUsername) {
            myProfile = { uid: user.uid, username: cachedUsername };
          } else {
            if (userEmail) userEmail.textContent = "ตั้งไอดีของคุณ";
          }
          await syncMoviesIfNeeded(user, movies);
          if (!myProfile?.username && !cachedUsername) setTimeout(openUsernameSetup, 350);
        } catch (error) {
          console.warn("Profile sync failed:", error);
          if (!cachedUsername && userEmail) userEmail.textContent = "ตั้งไอดีของคุณ";
        }
      } else {
        myProfile = null;
        if (loginBtn) loginBtn.style.display = "inline-flex";
        if (userProfileBar) userProfileBar.style.display = "none";
        if (peopleSearchWrap) peopleSearchWrap.style.display = "none";
      }
    });
