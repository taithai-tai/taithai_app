import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Check redirect results on load
getRedirectResult(auth).then(async (result) => {
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
  } catch (err) {
    console.warn("Could not save user profile to Firestore:", err);
  }
}

export async function loginWithGoogle() {
  if (window.location.protocol === 'file:') {
    throw new Error('AUTH_REQUIRES_HTTP');
  }

  try {
    await signInWithRedirect(auth, googleProvider);
    return null;
  } catch (error) {
    console.error("Redirect login error:", error);
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
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      saveUserProfile(user);
    }
    callback(user);
  });
}
