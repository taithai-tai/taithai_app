/* The HttpOnly app-access cookie has the same owner identity as the existing Firebase sign-in. */
export const isAppOwner = user => user?.emailVerified === true && String(user.email || '').toLowerCase() === 'taithai5002@gmail.com';
const managers = new WeakMap();
export function getOwnerSessionManager(auth) {
  if (!managers.has(auth)) managers.set(auth, createOwnerSessionManager({ getUser: () => auth.currentUser }));
  return managers.get(auth);
}

export function createOwnerSessionManager({ getUser, request = fetch } = {}) {
  let generation = 0, clearing = false;
  const pending = new Set();
  async function send(method, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await request('/api/app-access', { method, credentials: 'same-origin', cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
      if (!response.ok) throw Object.assign(Error('APP_SESSION_UNAVAILABLE'), { code: response.status === 403 ? 'site/permission-denied' : 'site/session-unavailable' });
      return true;
    } finally { clearTimeout(timer); }
  }
  async function clear() {
    generation++; clearing = true;
    try {
      // A sign-out must finish after any pending Set-Cookie response, not before it.
      await Promise.allSettled([...pending]);
      await send('DELETE');
    } finally { clearing = false; }
  }
  function refresh(user = getUser()) {
    if (!isAppOwner(user)) return clear();
    if (clearing) return Promise.resolve(false);
    const current = generation;
    const work = (async () => {
      const token = await user.getIdToken();
      if (current !== generation || getUser()?.uid !== user.uid || !isAppOwner(getUser())) return false;
      await send('POST', token);
      if (current !== generation || getUser()?.uid !== user.uid || !isAppOwner(getUser())) { await send('DELETE'); return false; }
      return true;
    })();
    pending.add(work); work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  }
  return { refresh, clear };
}
