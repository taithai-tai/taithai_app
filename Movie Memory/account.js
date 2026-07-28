    import {
      loginWithGoogle,
      logout,
      subscribeAuth,
      getMyPublicProfile,
      claimUsername,
      searchPublicProfiles,
      getPublicProfile,
      getMyMovieCollection,
      subscribeMyMovieCollection,
      saveMyMovieCollection
    } from "../firebase-auth.js?v=20260728-1";

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
    let movieCollectionUnsubscribe = null;
    const profileSearchCache = new Map();
    const usernameCacheKey = uid => `movie_memory_username_${uid}`;
    const movieSyncKey = uid => `movie_memory_public_sync_v2_${uid}`;
    const accountMoviesKey = uid => `movie_memory_collection_${uid}`;
    const pendingSyncKey = uid => `movie_memory_pending_sync_${uid}`;
    const legacyOwnerKey = "movie_memory_legacy_owner_uid";

    function readStoredCollection(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    }

    function currentLocalCollection() {
      return readStoredCollection("taithai_movie_memory_v2");
    }

    function publicMovieFingerprint(collection) {
      return JSON.stringify((Array.isArray(collection) ? collection : []).map(movie => ({
        id: movie.id,
        title: movie.title,
        tmdbId: movie.tmdbId,
        watchDate: movie.watchDate,
        releaseDate: movie.releaseDate,
        format: movie.format,
        cinema: movie.cinema,
        seat: movie.seat,
        companion: movie.companion,
        rating: movie.rating,
        note: movie.note,
        posterImg: /^https:\/\//.test(movie.posterImg || "") ? movie.posterImg : "",
        ticketImg: /^https:\/\//.test(movie.ticketImg || "") ? movie.ticketImg : "",
        viewings: (Array.isArray(movie.viewings) ? movie.viewings : []).map(viewing => ({
          id: viewing.id,
          watchDate: viewing.watchDate,
          format: viewing.format,
          cinema: viewing.cinema,
          seat: viewing.seat,
          companion: viewing.companion,
          memory: viewing.memory,
          ticketImg: /^https:\/\//.test(viewing.ticketImg || "") ? viewing.ticketImg : "",
          createdAt: viewing.createdAt
        })),
        updatedAt: movie.updatedAt
      })));
    }

    function mergeCloudWithLocal(cloudMovies, localMovies) {
      const localById = new Map((Array.isArray(localMovies) ? localMovies : []).map(movie => [movie.id, movie]));
      return (Array.isArray(cloudMovies) ? cloudMovies : []).map(movie => {
        const local = localById.get(movie.id);
        if (!local) return movie;
        const localViewings = new Map((Array.isArray(local.viewings) ? local.viewings : []).map(viewing => [viewing.id, viewing]));
        return {
          ...movie,
          posterImg: movie.posterImg || (/^data:image\//.test(local.posterImg || "") ? local.posterImg : ""),
          ticketImg: movie.ticketImg || (/^data:image\//.test(local.ticketImg || "") ? local.ticketImg : ""),
          viewings: Array.isArray(movie.viewings) && movie.viewings.length
            ? movie.viewings.map(viewing => {
                const localViewing = localViewings.get(viewing.id);
                return {
                  ...viewing,
                  ticketImg: viewing.ticketImg || (/^data:image\//.test(localViewing?.ticketImg || "") ? localViewing.ticketImg : "")
                };
              })
            : (Array.isArray(local.viewings) ? local.viewings : [])
        };
      });
    }

    function mergeLegacyCollection(cloudMovies, localMovies) {
      const merged = new Map((Array.isArray(cloudMovies) ? cloudMovies : []).map(movie => [movie.id, movie]));
      (Array.isArray(localMovies) ? localMovies : []).forEach(movie => merged.set(movie.id, movie));
      return [...merged.values()];
    }

    async function syncMoviesIfNeeded(user, collection) {
      if (!user) return;
      const fingerprint = publicMovieFingerprint(collection);
      if (localStorage.getItem(movieSyncKey(user.uid)) === fingerprint) {
        localStorage.removeItem(pendingSyncKey(user.uid));
        localStorage.removeItem("movie_memory_local_dirty");
        return;
      }
      await saveMyMovieCollection(user, collection);
      localStorage.setItem(accountMoviesKey(user.uid), JSON.stringify(collection));
      localStorage.setItem(movieSyncKey(user.uid), fingerprint);
      localStorage.removeItem(pendingSyncKey(user.uid));
      localStorage.removeItem("movie_memory_local_dirty");
    }

    function openUsernameSetup() {
      if (!signedInUser) return;
      const fileMode = window.location.protocol === "file:";
      if (!fileMode && !window.location.pathname.replace(/\/+$/, "").endsWith("/Movie-Memory/settings")) {
        window.location.href = "/Movie-Memory/settings/";
        return;
      }
      document.body.classList.add("route-page");
      document.getElementById("profileModalTitle").textContent = "ตั้งไอดีของคุณ";
      profileSetup.hidden = false;
      publicProfileView.hidden = true;
      document.getElementById("usernameInput").value = myProfile?.username || "";
      const backButton = document.getElementById("closeProfileBtn");
      backButton.textContent = "←";
      backButton.title = "กลับ";
      if (!profileModal.open) profileModal.show();
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
            <small>${formatDate(movie.watchDate)} · ดู ${Math.max(1, Number(movie.watchCount) || (Array.isArray(movie.viewings) ? movie.viewings.length : 0))} ครั้ง · ${formatStars(movie.rating)}</small>
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
      const username = profile.username || profile.uid;
      const params = new URLSearchParams({ uid: profile.uid });
      window.location.href = window.location.protocol === "file:"
        ? `./profile.html?username=${encodeURIComponent(username)}&${params.toString()}`
        : `/Movie-Memory/profile/?username=${encodeURIComponent(username)}&${params.toString()}`;
    }

    document.getElementById("closeProfileBtn").addEventListener("click", () => {
      if (window.location.protocol === "file:") {
        profileModal.close();
        document.body.classList.remove("route-page");
      } else if (window.location.pathname.includes("/Movie-Memory/settings")) {
        window.location.href = "/Movie%20Memory/";
      } else {
        profileModal.close();
      }
    });
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
        } catch (error) {
          console.warn("Public profile search failed:", error);
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
      if (signedInUser) {
        const collection = Array.isArray(event.detail) ? event.detail : [];
        localStorage.setItem(legacyOwnerKey, signedInUser.uid);
        localStorage.setItem(accountMoviesKey(signedInUser.uid), JSON.stringify(collection));
        localStorage.setItem(pendingSyncKey(signedInUser.uid), publicMovieFingerprint(collection));
      }
      movieSyncTimer = setTimeout(() => {
        if (signedInUser) syncMoviesIfNeeded(signedInUser, event.detail).catch(() => {
          showToast("บันทึกในเครื่องแล้ว แต่ซิงก์โปรไฟล์ไม่สำเร็จ");
        });
      }, 80);
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
      const previousUser = signedInUser;
      signedInUser = user;
      if (movieCollectionUnsubscribe) {
        movieCollectionUnsubscribe();
        movieCollectionUnsubscribe = null;
      }
      if (user) {
        if (loginBtn) loginBtn.style.display = "none";
        if (userProfileBar) userProfileBar.style.display = "inline-flex";

        const name = user.displayName || user.email || "User";
        const photo = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        if (userAvatar) userAvatar.src = photo;
        if (userName) userName.textContent = name;
        const cachedUsername = localStorage.getItem(usernameCacheKey(user.uid));
        if (cachedUsername) {
          myProfile = { uid: user.uid, username: cachedUsername };
          if (userEmail) userEmail.textContent = `@${cachedUsername}`;
        }
        try {
          const cloudCollection = await getMyMovieCollection(user);
          const accountCollection = readStoredCollection(accountMoviesKey(user.uid));
          const hasAccountCollection = localStorage.getItem(accountMoviesKey(user.uid)) !== null;
          const hasPendingSync = localStorage.getItem(pendingSyncKey(user.uid)) !== null;
          const legacyOwner = localStorage.getItem(legacyOwnerKey);
          const hasLocalDirty = localStorage.getItem("movie_memory_local_dirty") === "1"
            && (!legacyOwner || legacyOwner === user.uid);
          let syncedCollection;

          if (hasPendingSync && hasAccountCollection) {
            syncedCollection = accountCollection;
          } else if (hasLocalDirty) {
            syncedCollection = currentLocalCollection();
            localStorage.setItem(legacyOwnerKey, user.uid);
          } else if (cloudCollection.source === "private") {
            syncedCollection = mergeCloudWithLocal(cloudCollection.movies, accountCollection);
          } else if (cloudCollection.source === "legacy") {
            const migratableLocal = (!legacyOwner || legacyOwner === user.uid)
              ? currentLocalCollection()
              : accountCollection;
            syncedCollection = mergeLegacyCollection(cloudCollection.movies, migratableLocal);
            localStorage.setItem(legacyOwnerKey, user.uid);
          } else if (accountCollection.length) {
            syncedCollection = accountCollection;
          } else if (!legacyOwner || legacyOwner === user.uid) {
            syncedCollection = currentLocalCollection();
            localStorage.setItem(legacyOwnerKey, user.uid);
          } else {
            syncedCollection = [];
          }

          localStorage.setItem(accountMoviesKey(user.uid), JSON.stringify(syncedCollection));
          localStorage.setItem("taithai_movie_memory_v2", JSON.stringify(syncedCollection));
          window.dispatchEvent(new CustomEvent("movie-memory:replace", { detail: syncedCollection }));

          myProfile = await getMyPublicProfile(user);
          if (myProfile?.username) {
            localStorage.setItem(usernameCacheKey(user.uid), myProfile.username);
            if (userEmail) userEmail.textContent = `@${myProfile.username}`;
          } else if (cachedUsername) {
            myProfile = { uid: user.uid, username: cachedUsername };
          } else {
            if (userEmail) userEmail.textContent = "ตั้งไอดีของคุณ";
          }
          await syncMoviesIfNeeded(user, syncedCollection);
          movieCollectionUnsubscribe = subscribeMyMovieCollection(user, remoteMovies => {
            if (signedInUser?.uid !== user.uid) return;
            if (localStorage.getItem(pendingSyncKey(user.uid)) !== null) return;
            const mergedMovies = mergeCloudWithLocal(remoteMovies, currentLocalCollection());
            localStorage.setItem(accountMoviesKey(user.uid), JSON.stringify(mergedMovies));
            localStorage.setItem(movieSyncKey(user.uid), publicMovieFingerprint(remoteMovies));
            window.dispatchEvent(new CustomEvent("movie-memory:replace", { detail: mergedMovies }));
          });
          if (!myProfile?.username && !cachedUsername) setTimeout(openUsernameSetup, 350);
        } catch (error) {
          console.warn("Profile sync failed:", error);
          if (!cachedUsername && userEmail) userEmail.textContent = "ตั้งไอดีของคุณ";
        }
      } else {
        myProfile = null;
        if (previousUser) {
          localStorage.setItem("taithai_movie_memory_v2", "[]");
          window.dispatchEvent(new CustomEvent("movie-memory:replace", { detail: [] }));
        }
        if (loginBtn) loginBtn.style.display = "inline-flex";
        if (userProfileBar) userProfileBar.style.display = "none";
      }
    });

    if (window.location.pathname.replace(/\/+$/, "").endsWith("/Movie-Memory/settings")) {
      subscribeAuth(user => {
        if (user) openUsernameSetup();
        else window.location.href = "/Movie%20Memory/";
      });
    }
