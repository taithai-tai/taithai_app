import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup,
  getRedirectResult,
  GoogleAuthProvider, 
  browserLocalPersistence,
  setPersistence,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, 
  collection,
  doc, 
  getDoc,
  getDocs,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  runTransaction,
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
export const db = getFirestore(app, "ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb");
const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Could not enable persistent Firebase session:", error);
  throw error;
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Check redirect results on load
authReady.then(() => getRedirectResult(auth)).then(async (result) => {
  if (result && result.user) {
    await saveUserProfile(result.user);
  }
}).catch((error) => {
  console.error("Redirect sign-in error:", error);
});

async function saveUserProfile(user) {
  if (!user) return;
  try {
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
      await saveUserProfile(result.user);
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
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) await saveUserProfile(user);
      callback(user);
    });
  }).catch(() => callback(null));
  return () => unsubscribe();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 24);
}

export async function getMyPublicProfile(user) {
  if (!user) return null;
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

export async function publishMovieCollection(user, movies) {
  if (!user) return;
  const publicMovies = (Array.isArray(movies) ? movies : []).slice(0, 200).map(movie => ({
    id: String(movie.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    title: String(movie.title || "").slice(0, 100),
    tmdbId: Number(movie.tmdbId) || null,
    watchDate: String(movie.watchDate || "").slice(0, 10),
    releaseDate: String(movie.releaseDate || "").slice(0, 10),
    format: String(movie.format || "").slice(0, 40),
    cinema: String(movie.cinema || "").slice(0, 80),
    rating: Math.min(5, Math.max(0, Number(movie.rating) || 0)),
    posterImg: /^https:\/\//.test(movie.posterImg || "") ? movie.posterImg : ""
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
