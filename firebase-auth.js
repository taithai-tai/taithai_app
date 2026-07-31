import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup,
  GoogleAuthProvider, 
  browserLocalPersistence,
  setPersistence,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnHpQONClba7a9G0uM36cI1jcfz5jTVEA",
  authDomain: "gen-lang-client-0141234491.firebaseapp.com",
  projectId: "gen-lang-client-0141234491",
  storageBucket: "gen-lang-client-0141234491.firebasestorage.app",
  messagingSenderId: "277444220182",
  appId: "1:277444220182:web:787e8989b557d008152c37"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let db = null;
let collection;
let doc;
let getDoc;
let getDocs;
let onSnapshot;
let query;
let orderBy;
let startAt;
let endAt;
let limit;
let runTransaction;
let setDoc;
let serverTimestamp;
let firestoreReady = null;
let storage;
let storageRef;
let uploadString;
let getDownloadURL;
let storageReady = null;
function ensureFirestore() {
  if (!firestoreReady) {
    firestoreReady = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
      .then(module => {
        ({
          collection,
          doc,
          getDoc,
          getDocs,
          onSnapshot,
          query,
          orderBy,
          startAt,
          endAt,
          limit,
          runTransaction,
          setDoc,
          serverTimestamp
        } = module);
        db = module.getFirestore(app, "ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb");
        return db;
      })
      .catch(error => {
        firestoreReady = null;
        throw error;
      });
  }
  return firestoreReady;
}

function ensureStorage() {
  if (!storageReady) {
    storageReady = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js")
      .then(module => {
        storageRef = module.ref;
        uploadString = module.uploadString;
        getDownloadURL = module.getDownloadURL;
        storage = module.getStorage(app);
        return storage;
      })
      .catch(error => {
        storageReady = null;
        throw error;
      });
  }
  return storageReady;
}
const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Could not enable persistent Firebase session:", error);
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

async function saveUserProfile(user) {
  if (!user) return;
  try {
    await ensureFirestore();
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastLoginAt: new Date().toISOString(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await setDoc(doc(db, "publicProfiles", user.uid), {
      uid: user.uid,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save user profile to Firestore:", err);
  }
}

export async function loginWithGoogle() {
  if (window.location.protocol === 'file:') {
    throw new Error('AUTH_REQUIRES_HTTP');
  }

  try {
    await authReady;
    const result = await signInWithPopup(auth, googleProvider);
    if (result?.user) {
      saveUserProfile(result.user);
      return result.user;
    }
    return null;
  } catch (error) {
    console.error("Google popup login error:", error);
    throw error;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

export function subscribeAuth(callback) {
  let unsubscribe = () => {};
  authReady.then(() => {
    unsubscribe = onAuthStateChanged(auth, user => {
      callback(user);
      if (user) saveUserProfile(user);
    });
  }).catch(() => callback(null));
  return () => unsubscribe();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 24);
}

export async function getMyPublicProfile(user) {
  if (!user) return null;
  await ensureFirestore();
  try {
    const snapshot = await getDoc(doc(db, "publicProfiles", user.uid));
    if (snapshot.exists() && snapshot.data()?.username) return snapshot.data();
  } catch (error) {
    console.warn("Public profile is not available yet, using the private profile:", error);
  }
  const privateSnapshot = await getDoc(doc(db, "users", user.uid));
  return privateSnapshot.exists() ? privateSnapshot.data() : null;
}

export async function claimUsername(user, requestedUsername) {
  if (!user) throw new Error("LOGIN_REQUIRED");
  await ensureFirestore();
  const username = normalizeUsername(requestedUsername);
  if (!/^[a-z0-9._ก-๙]{3,24}$/u.test(username)) throw new Error("INVALID_USERNAME");

  await runTransaction(db, async transaction => {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await transaction.get(userRef);
    const oldUsername = normalizeUsername(userSnap.data()?.username);
    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await transaction.get(usernameRef);
    const publicProfileRef = doc(db, "publicProfiles", user.uid);
    if (usernameSnap.exists() && usernameSnap.data()?.uid !== user.uid) {
      throw new Error("USERNAME_TAKEN");
    }

    transaction.set(usernameRef, { uid: user.uid, username, updatedAt: serverTimestamp() });
    transaction.set(userRef, {
      uid: user.uid,
      username,
      usernameLower: username,
      updatedAt: serverTimestamp()
    }, { merge: true });
    transaction.set(publicProfileRef, {
      uid: user.uid,
      username,
      usernameLower: username,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp()
    }, { merge: true });
    if (oldUsername && oldUsername !== username) {
      transaction.delete(doc(db, "usernames", oldUsername));
    }
  });
  return username;
}

export async function searchPublicProfiles(searchText) {
  const term = normalizeUsername(searchText);
  if (!term) return [];
  await ensureFirestore();
  const profilesQuery = query(
    collection(db, "publicProfiles"),
    orderBy("usernameLower"),
    startAt(term),
    endAt(`${term}\uf8ff`),
    limit(12)
  );
  const snapshot = await getDocs(profilesQuery);
  return snapshot.docs
    .map(item => item.data())
    .filter(profile => profile.username && profile.uid);
}

export async function getPublicProfile(uid) {
  await ensureFirestore();
  const profileSnap = await getDoc(doc(db, "publicProfiles", uid));
  if (!profileSnap.exists()) throw new Error("PROFILE_NOT_FOUND");
  const profile = profileSnap.data();
  if (Array.isArray(profile.publicMovies)) {
    return {
      profile,
      movies: profile.publicMovies.slice(0, 200).sort((a, b) => String(b.watchDate || "").localeCompare(String(a.watchDate || "")))
    };
  }
  let movies = [];
  try {
    const movieSnap = await getDocs(query(collection(db, "users", uid, "publicMovies"), orderBy("watchDate", "desc"), limit(200)));
    movies = movieSnap.docs.map(item => item.data());
  } catch (error) {
    console.warn("Legacy public movie collection is not readable:", error);
  }
  return {
    profile,
    movies
  };
}

export async function getPublicProfileByUsername(username) {
  const normalized = normalizeUsername(username).replace(/^@/, "");
  if (!normalized) throw new Error("PROFILE_NOT_FOUND");
  await ensureFirestore();
  const profileQuery = query(
    collection(db, "publicProfiles"),
    orderBy("usernameLower"),
    startAt(normalized),
    endAt(normalized),
    limit(1)
  );
  const snapshot = await getDocs(profileQuery);
  if (snapshot.empty) throw new Error("PROFILE_NOT_FOUND");
  return getPublicProfile(snapshot.docs[0].data().uid);
}

function cloudMovieCollection(movies) {
  return (Array.isArray(movies) ? movies : []).slice(0, 300).map(movie => ({
    id: String(movie.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    title: String(movie.title || "").slice(0, 100),
    tmdbId: Number(movie.tmdbId) || null,
    watchDate: String(movie.watchDate || "").slice(0, 10),
    releaseDate: String(movie.releaseDate || "").slice(0, 10),
    format: String(movie.format || "").slice(0, 40),
    cinema: String(movie.cinema || "").slice(0, 80),
    seat: String(movie.seat || "").slice(0, 40),
    companion: String(movie.companion || "").slice(0, 80),
    rating: Math.min(5, Math.max(0, Math.round((Number(movie.rating) || 0) * 2) / 2)),
    note: String(movie.note || "").slice(0, 1000),
    posterImg: /^https:\/\//.test(movie.posterImg || "") ? movie.posterImg : "",
    ticketImg: /^https:\/\//.test(movie.ticketImg || "") ? movie.ticketImg : "",
    viewings: (Array.isArray(movie.viewings) ? movie.viewings : []).slice(-100).map((viewing, index) => ({
      id: String(viewing.id || `viewing_${index}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      watchDate: String(viewing.watchDate || "").slice(0, 10),
      format: String(viewing.format || "").slice(0, 40),
      cinema: String(viewing.cinema || "").slice(0, 80),
      seat: String(viewing.seat || "").slice(0, 40),
      companion: String(viewing.companion || "").slice(0, 80),
      memory: String(viewing.memory || "").slice(0, 800),
      ticketImg: /^https:\/\//.test(viewing.ticketImg || "") ? viewing.ticketImg : "",
      createdAt: String(viewing.createdAt || "").slice(0, 40)
    })),
    updatedAt: String(movie.updatedAt || "").slice(0, 40)
  }));
}

function safeStorageId(value, fallback) {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || fallback;
}

async function uploadPrivateTicketImage(user, movieId, viewingId, imageData) {
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(imageData || "")) return imageData || "";
  await ensureStorage();
  const mimeType = imageData.slice(5, imageData.indexOf(";")).toLowerCase();
  const target = storageRef(
    storage,
    `users/${safeStorageId(user.uid, "user")}/movie-memory/tickets/${safeStorageId(movieId, "movie")}/${safeStorageId(viewingId, "viewing")}`
  );
  const snapshot = await uploadString(target, imageData, "data_url", {
    contentType: mimeType,
    cacheControl: "private,max-age=31536000"
  });
  return getDownloadURL(snapshot.ref);
}

async function cloudMovieCollectionWithTicketImages(user, movies) {
  const source = (Array.isArray(movies) ? movies : []).slice(0, 300);
  const prepared = source.map(movie => ({
    ...movie,
    viewings: (Array.isArray(movie.viewings) ? movie.viewings : []).slice(-100).map(viewing => ({ ...viewing }))
  }));
  const jobs = [];

  prepared.forEach((movie, movieIndex) => {
    if (movie.viewings.length) {
      movie.viewings.forEach((viewing, viewingIndex) => {
        if (!/^data:image\//i.test(viewing.ticketImg || "")) return;
        jobs.push({ movieIndex, viewingIndex, image: viewing.ticketImg });
      });
    } else if (/^data:image\//i.test(movie.ticketImg || "")) {
      movie.viewings = [{
        id: `viewing_${movie.id || movieIndex}`,
        watchDate: movie.watchDate,
        format: movie.format,
        cinema: movie.cinema,
        seat: movie.seat,
        companion: movie.companion,
        memory: "",
        ticketImg: movie.ticketImg,
        createdAt: movie.updatedAt
      }];
      jobs.push({ movieIndex, viewingIndex: 0, image: movie.ticketImg });
    }
  });

  let failedImageUploads = 0;
  for (let start = 0; start < jobs.length; start += 3) {
    await Promise.all(jobs.slice(start, start + 3).map(async job => {
      const movie = prepared[job.movieIndex];
      const viewing = movie.viewings[job.viewingIndex];
      try {
        viewing.ticketImg = await uploadPrivateTicketImage(
          user,
          movie.id || `movie_${job.movieIndex}`,
          viewing.id || `viewing_${job.viewingIndex}`,
          job.image
        );
      } catch (error) {
        failedImageUploads += 1;
        console.warn("Ticket image upload failed:", error);
      }
    }));
  }

  prepared.forEach(movie => {
    const latest = [...movie.viewings]
      .sort((first, second) =>
        `${second.watchDate || ""}|${second.createdAt || ""}|${second.id || ""}`
          .localeCompare(`${first.watchDate || ""}|${first.createdAt || ""}|${first.id || ""}`)
      )[0];
    if (latest?.ticketImg) movie.ticketImg = latest.ticketImg;
  });

  return {
    movies: cloudMovieCollection(prepared),
    failedImageUploads
  };
}

export async function getMyMovieCollection(user) {
  if (!user) return { exists: false, source: "none", movies: [] };
  await ensureFirestore();
  const userSnapshot = await getDoc(doc(db, "users", user.uid));
  const privateMovies = userSnapshot.data()?.movieCollection;
  if (Array.isArray(privateMovies)) {
    return { exists: true, source: "private", movies: privateMovies };
  }

  // Import collections published by older Movie Memory versions once.
  const publicSnapshot = await getDoc(doc(db, "publicProfiles", user.uid));
  const legacyMovies = publicSnapshot.data()?.publicMovies;
  return Array.isArray(legacyMovies)
    ? { exists: true, source: "legacy", movies: legacyMovies }
    : { exists: false, source: "none", movies: [] };
}

export function subscribeMyMovieCollection(user, callback) {
  if (!user) return () => {};
  let unsubscribe = () => {};
  let stopped = false;
  ensureFirestore().then(() => {
    if (stopped) return;
    unsubscribe = onSnapshot(doc(db, "users", user.uid), snapshot => {
      const movies = snapshot.data()?.movieCollection;
      if (Array.isArray(movies)) callback(movies);
    }, error => {
      console.warn("Movie collection live sync failed:", error);
    });
  }).catch(error => {
    console.warn("Movie collection live sync could not start:", error);
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}

export async function saveMyMovieCollection(user, movies) {
  if (!user) throw new Error("LOGIN_REQUIRED");
  await ensureFirestore();
  const prepared = await cloudMovieCollectionWithTicketImages(user, movies);
  const movieCollection = prepared.movies;
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    movieCollection,
    movieCollectionUpdatedAt: serverTimestamp()
  }, { merge: true });
  await publishMovieCollection(user, movieCollection);
  return {
    movies: movieCollection,
    failedImageUploads: prepared.failedImageUploads
  };
}

export async function publishMovieCollection(user, movies) {
  if (!user) return;
  await ensureFirestore();
  const publicMovies = cloudMovieCollection(movies).slice(0, 200).map(movie => ({
    id: movie.id,
    title: movie.title,
    tmdbId: movie.tmdbId,
    watchDate: movie.watchDate,
    releaseDate: movie.releaseDate,
    format: movie.format,
    cinema: movie.cinema,
    rating: movie.rating,
    note: String(movie.note || "").slice(0, 1000),
    posterImg: movie.posterImg,
    watchCount: Math.max(1, Array.isArray(movie.viewings) ? movie.viewings.length : 0)
  }));

  await setDoc(doc(db, "publicProfiles", user.uid), {
    uid: user.uid,
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    publicMovies,
    publicMovieCount: publicMovies.length,
    publicMoviesUpdatedAt: serverTimestamp()
  }, { merge: true });

}
