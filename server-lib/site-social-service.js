import { createHash, randomUUID } from 'node:crypto';
export const SOCIAL_LIMITS = Object.freeze({ postText: 3000, messageText: 4000, maxAttachments: 4, imageBytes: 10 * 1024 * 1024, videoBytes: 100 * 1024 * 1024 });
export class SocialError extends Error {
    constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new SocialError(code, status); };
const uidOK = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const uuidOK = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function canonicalMediaURL(value, path) {
    if (typeof value !== 'string') return false;
    try { const url = new URL(value), asset = path.split('/').at(-1).split('.')[0];
        return url.origin === 'https://taithai-app.netlify.app' && url.pathname === '/api/social-media/' && !url.hash && !url.username && !url.password
            && [...url.searchParams.keys()].length === 1 && url.searchParams.get('id') === asset && uuidOK(asset);
    } catch { return false; }
}

const object = value => value && typeof value === 'object' && !Array.isArray(value);
function fields(value, allowed) { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)))
    fail('INVALID_REQUEST'); }
function id(value) { if (!uidOK(value))
    fail('INVALID_ACCOUNT'); return value; }
function requestId(value) { if (!uuidOK(value))
    fail('INVALID_REQUEST_ID'); return value.toLowerCase(); }
function actor(user) { if (!uidOK(user?.uid))
    fail('AUTH_REQUIRED', 401); if (user.email_verified !== true)
    fail('VERIFIED_ACCOUNT_REQUIRED', 403); return user.uid; }
const optionalActor = user => user ? actor(user) : null;
function text(value, min, max, code = 'INVALID_REQUEST') {
    if (typeof value !== 'string')
        fail(code);
    value = value.replace(/\r\n?/g, '\n').trim().normalize('NFC');
    if (value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))
        fail(code);
    return value;
}
const RESERVED_HANDLES = new Set(['admin', 'administrator', 'support', 'taithai', 'official', 'account', 'mail', 'help', 'settings', 'profile', 'community', 'messages', 'search']);
function handle(value) { if (typeof value !== 'string')
    fail('INVALID_HANDLE'); value = value.trim().toLowerCase(); if (!/^[a-z0-9_]{3,24}$/.test(value))
    fail('INVALID_HANDLE'); return value; }
function iso(value) { const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value); if (!Number.isFinite(date.getTime()))
    fail('INVALID_STORED_DATE', 503); return date.toISOString(); }
const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
function googlePhoto(value) { if (typeof value !== 'string' || value.length > 2048)
    return ''; try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) && !url.username && !url.password ? url.href : '';
}
catch {
    return '';
} }
function profileDTO(record) { if (!record || record.active !== true || !uidOK(record.uid))
    return null; return { uid: record.uid, handle: record.handle, displayName: record.displayName, bio: record.bio || '', photoURL: record.photoURL || '', followersCount: safeCount(record.followersCount), followingCount: safeCount(record.followingCount), postsCount: safeCount(record.postsCount), createdAt: iso(record.createdAt), updatedAt: iso(record.updatedAt) }; }
function searchTokens(name, username) { const values = new Set(); for (const word of [username, name, ...name.split(/\s+/u)]) {
    const lower = word.toLocaleLowerCase('th-TH');
    for (let n = 2; n <= Math.min(48, lower.length); n++)
        values.add(lower.slice(0, n));
} return [...values].slice(0, 512); }
const profilePath = uid => `siteSocialProfiles/${uid}`;
const blockPath = (uid, peer) => `siteSocialBlocks/${uid}/users/${peer}`;
const followingPath = (uid, peer) => `siteSocialFollows/${uid}/following/${peer}`;
const followerPath = (uid, peer) => `siteSocialFollows/${uid}/followers/${peer}`;
const inboxPath = (uid, thread) => `siteSocialInboxes/${uid}/threads/${thread}`;
const threadID = (uid, peer) => hash([uid, peer].sort());
const participantsOK = (record, uid, peer) => Array.isArray(record?.participants) && record.participants.length === 2 && record.participants.includes(uid) && record.participants.includes(peer);
const bounded = (value, maximum, fallback = maximum) => { if (value === undefined)
    return fallback; if (!Number.isInteger(value) || value < 1 || value > maximum)
    fail('INVALID_QUERY'); return value; };
function cursorEncode(kind, scope, row) { return Buffer.from(JSON.stringify({ v: 1, kind, scope: hash(scope), id: row.id })).toString('base64url'); }
function cursorDecode(value, kind, scope) { if (typeof value !== 'string' || value.length > 700 || !/^[A-Za-z0-9_-]+$/.test(value))
    fail('INVALID_CURSOR'); let parsed; try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}
catch {
    fail('INVALID_CURSOR');
} if (parsed.v !== 1 || parsed.kind !== kind || parsed.scope !== hash(scope) || !uidOK(parsed.id))
    fail('INVALID_CURSOR'); return parsed.id; }
function attachmentInputs(user, attachments, postId) {
    if (!Array.isArray(attachments) || attachments.length > SOCIAL_LIMITS.maxAttachments)
        fail('INVALID_MEDIA');
    const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }, seen = new Set();
    const output = attachments.map(item => {
        fields(item, ['path', 'type', 'size', 'name']);
        const ext = types[item.type], parts = typeof item.path === 'string' ? item.path.split('/') : [];
        if (!ext || parts.length !== 4 || parts[0] !== 'social-media' || parts[1] !== user.uid || parts[2] !== postId || parts[3] !== parts[3].toLowerCase() || !parts[3].endsWith('.' + ext) || !uuidOK(parts[3].slice(0, -ext.length - 1)) || seen.has(item.path) || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > (item.type.startsWith('video/') ? SOCIAL_LIMITS.videoBytes : SOCIAL_LIMITS.imageBytes))
            fail('INVALID_MEDIA');
        seen.add(item.path);
        return { path: item.path, type: item.type, size: item.size, name: text(item.name, 1, 180, 'INVALID_MEDIA') };
    });
    if (output.some(item => item.type.startsWith('video/')) && output.length !== 1)
        fail('INVALID_MEDIA');
    return output;
}
/** Public social data and private messaging remain in server-only collections. */
export function createSocialService({ store, auth, media, now = () => new Date(), uuid = randomUUID } = {}) {
    if (!store?.get || !store?.list || !store?.transaction)
        throw new TypeError('store is required');
    const stamp = () => new Date(iso(now()));
    async function profile(uid, reader = store, required = true) { const value = await reader.get(profilePath(uid)); if (!profileDTO(value)) {
        if (required)
            fail('PROFILE_NOT_FOUND', 404);
        return null;
    } if (value.uid !== uid)
        fail('PROFILE_NOT_FOUND', 404); return value; }
    async function ownProfile(user, reader = store) { const uid = actor(user), value = await profile(uid, reader, false); if (!value)
        fail('PROFILE_REQUIRED', 409); return value; }
    async function contactState(uid, peer, reader = store) {
        if (!uid || uid === peer) return {blocked:false,blocking:false};
        const [own, other] = await Promise.all([reader.get(blockPath(uid,peer)),reader.get(blockPath(peer,uid))]);
        return {blocked:own?.active===true||other?.active===true,blocking:own?.active===true};
    }
    async function blocked(uid, peer, reader = store) { return (await contactState(uid,peer,reader)).blocked; }
    async function viewer(user, peer) { const uid = optionalActor(user); if (!uid)
        return { isSelf: false, following: false, blocked: false, blocking: false, canMessage: false }; if (uid === peer)
        return { isSelf: true, following: false, blocked: false, blocking: false, canMessage: false }; const [own, edge, a, b] = await Promise.all([profile(uid, store, false), store.get(followingPath(uid, peer)), store.get(blockPath(uid, peer)), store.get(blockPath(peer, uid))]); return { isSelf: false, following: edge?.active === true, blocked: a?.active === true, blocking: a?.active === true, canMessage: Boolean(own) && a?.active !== true && b?.active !== true }; }
    const receiptPath = (uid, rid) => `siteSocialRequests/${hash([uid, rid])}`;
    async function receipt(user, rid, action, payload, reader = store) { const uid = actor(user), fingerprint = hash([action, uid, payload]), saved = await reader.get(receiptPath(uid, rid)); if (!saved)
        return { fingerprint }; if (saved.uid !== uid || saved.fingerprint !== fingerprint)
        fail('REQUEST_ID_REUSED', 409); return { fingerprint, result: { ...saved.result, replayed: true } }; }
    async function mutate(user, rid, action, payload, work) { const uid = actor(user); return store.transaction(async (tx) => { const previous = await receipt(user, rid, action, payload, tx); if (previous.result)
        return previous.result; const result = await work(tx); tx.create(receiptPath(uid, rid), { uid, action, fingerprint: previous.fingerprint, result, createdAt: stamp() }); return { ...result, replayed: false }; }); }
    async function page(collection, kind, scope, { limit, cursor } = {}, maximum = 20, field = 'createdAt', direction = 'desc') {
        limit = bounded(limit, maximum);
        let startAfter;
        if (cursor !== undefined && cursor !== null && cursor !== '') {
            const key = cursorDecode(cursor, kind, scope), record = await store.get(`${collection}/${key}`);
            if (!record || field !== '__name__' && !record[field])
                fail('INVALID_CURSOR');
            startAfter = field === '__name__' ? [key] : [record[field], key];
        }
        const rows = await store.list(collection, { limit, orderBy: field === '__name__' ? [['__name__', direction]] : [[field, direction], ['__name__', direction]], ...(startAfter ? { startAfter } : {}) });
        return { rows, nextCursor: rows.length === limit ? cursorEncode(kind, scope, rows.at(-1)) : null };
    }
    function profileCounts(record, changes, timestamp) { const result = { ...record, updatedAt: timestamp }; for (const [key, delta] of Object.entries(changes)) {
        const count = safeCount(record[key]) + delta;
        if (!Number.isSafeInteger(count))
            fail('COUNT_LIMIT_REACHED', 409);
        result[key] = Math.max(0, count);
    } return result; }
    async function postDTO(record, user) { if (record?.status !== 'active' || !uuidOK(record.id) || !uidOK(record.uid))
        return null; const uid = optionalActor(user); if (uid && await blocked(uid, record.uid))
        return null; const author = await profile(record.uid, store, false); if (!author)
        return null; return { id: record.id, uid: record.uid, author: profileDTO(author), text: record.text, attachments: (record.attachments || []).map(({ path, type, size, name, url }) => ({ path, type, size, name, url })), createdAt: iso(record.createdAt), updatedAt: iso(record.updatedAt), canEdit: uid === record.uid }; }
    function messageDTO(record, user) { if (!uuidOK(record?.id) || !uidOK(record.senderUid) || typeof record.text !== 'string')
        return null; return { id: record.id, senderUid: record.senderUid, text: record.text, createdAt: iso(record.createdAt), isMine: record.senderUid === user.uid }; }
    async function getMe(user) { actor(user); const mine = await profile(user.uid, store, false), legacy = mine ? null : await store.get(`publicProfiles/${user.uid}`); return { profile: profileDTO(mine), defaults: { displayName: typeof user.name === 'string' ? user.name.slice(0, 80) : typeof legacy?.displayName === 'string' ? legacy.displayName.slice(0, 80) : '', photoURL: googlePhoto(user.picture), handle: typeof legacy?.username === 'string' && /^[a-z0-9_]{3,24}$/.test(legacy.username) ? legacy.username : '' }, limits: SOCIAL_LIMITS }; }
    async function getProfile(user, input = {}) { optionalActor(user); fields(input, ['uid', 'handle']); let uid = input.uid; if (uid !== undefined)
        uid = id(uid);
    else if (input.handle !== undefined) {
        const value = handle(input.handle), entry = await store.get(`siteSocialHandles/${value}`);
        uid = entry?.uid;
        if (!uidOK(uid))
            fail('PROFILE_NOT_FOUND', 404);
    }
    else
        fail('INVALID_REQUEST'); const value = await profile(uid); if (input.handle !== undefined && value.handle !== handle(input.handle))
        fail('PROFILE_NOT_FOUND', 404); return { profile: profileDTO(value), viewer: await viewer(user, uid) }; }
    async function updateProfile(user, input) {
        actor(user);
        fields(input, ['handle', 'displayName', 'bio', 'photoURL', 'requestId']);
        const rid = requestId(input.requestId), username = handle(input.handle);
        if (RESERVED_HANDLES.has(username) && String(user.email || '').toLowerCase() !== 'taithai5002@gmail.com')
            fail('HANDLE_RESERVED', 409);
        const displayName = text(input.displayName, 1, 80, 'INVALID_PROFILE'), bio = text(input.bio ?? '', 0, 300, 'INVALID_PROFILE');
        let requestedPhoto;
        if (input.photoURL !== undefined) {
            if (typeof input.photoURL !== 'string' || input.photoURL !== '' && input.photoURL !== googlePhoto(user.picture))
                fail('INVALID_PROFILE');
            requestedPhoto = input.photoURL;
        }
        const payload = { handle: username, displayName, bio, ...(requestedPhoto !== undefined ? { photoURL: requestedPhoto } : {}) };
        return mutate(user, rid, 'profile_update', payload, async (tx) => { const [previous, reservation, legacy] = await Promise.all([tx.get(profilePath(user.uid)), tx.get(`siteSocialHandles/${username}`), tx.get(`usernames/${username}`)]); if (reservation?.uid && reservation.uid !== user.uid || legacy?.uid && legacy.uid !== user.uid)
            fail('HANDLE_TAKEN', 409); const timestamp = stamp(), value = { uid: user.uid, active: true, handle: username, displayName, bio, photoURL: requestedPhoto !== undefined ? requestedPhoto : previous?.photoURL || googlePhoto(user.picture), searchTokens: searchTokens(displayName, username), followersCount: safeCount(previous?.followersCount), followingCount: safeCount(previous?.followingCount), postsCount: safeCount(previous?.postsCount), createdAt: previous?.createdAt || timestamp, updatedAt: timestamp }; tx.set(profilePath(user.uid), value); tx.set(`siteSocialHandles/${username}`, { uid: user.uid, handle: username, createdAt: reservation?.createdAt || timestamp }); if (!legacy)
            tx.create(`usernames/${username}`, { uid: user.uid, createdAt: timestamp }); return { profile: profileDTO(value) }; });
    }
    async function searchProfiles(user, input = {}) { const uid = optionalActor(user); fields(input, ['q', 'limit', 'cursor']); if (input.cursor)
        fail('INVALID_CURSOR'); const q = text(input.q, 2, 48, 'INVALID_QUERY').replace(/^@/, '').toLocaleLowerCase('th-TH'); if (q.length < 2)
        fail('INVALID_QUERY'); const limit = bounded(input.limit, 20, 20), rows = await store.list('siteSocialProfiles', { where: [['searchTokens', 'array-contains', q]], limit }); const items = []; for (const row of rows) {
        const value = profileDTO(row);
        if (value && (!uid || !await blocked(uid, row.uid)))
            items.push(value);
    } return { items, nextCursor: null, query: q }; }
    async function listPosts(user, input = {}) { optionalActor(user); fields(input, ['uid', 'limit', 'cursor']); const uid = input.uid === undefined ? null : id(input.uid); if (uid)
        await profile(uid); const { rows, nextCursor } = await page(uid ? `${profilePath(uid)}/posts` : 'siteSocialPosts', 'posts', { uid }, input, 20); const items = (await Promise.all(rows.map(row => postDTO(row, user)))).filter(Boolean); return { items, nextCursor }; }
    async function createPost(user, input) {
        actor(user);
        fields(input, ['requestId', 'text', 'attachments']);
        const rid = requestId(input.requestId), body = text(input.text ?? '', 0, SOCIAL_LIMITS.postText, 'INVALID_POST'), attachments = attachmentInputs(user, input.attachments ?? [], rid);
        if (!body && !attachments.length)
            fail('INVALID_POST');
        const payload = { text: body, attachments }, previous = await receipt(user, rid, 'post_create', payload);
        if (previous.result)
            return previous.result;
        await ownProfile(user);
        let verified = [];
        if (attachments.length) {
            if (typeof media?.validate !== 'function')
                fail('MEDIA_NOT_READY', 503);
            verified = await media.validate(user, attachments, { postId: rid });
            if (!Array.isArray(verified) || verified.length !== attachments.length || verified.some((item, i) => item.path !== attachments[i].path || item.type !== attachments[i].type || item.size !== attachments[i].size || item.name !== attachments[i].name || !canonicalMediaURL(item.url,item.path)))
                fail('INVALID_MEDIA');
        }
        const result = await mutate(user, rid, 'post_create', payload, async (tx) => { const [mine, existing] = await Promise.all([ownProfile(user, tx), tx.get(`siteSocialPosts/${rid}`)]); if (existing)
            fail('REQUEST_ID_REUSED', 409); if (verified.length && typeof media?.assertPublishable === 'function') await media.assertPublishable(user,verified,{postId:rid},tx); const timestamp = stamp(), post = { id: rid, uid: user.uid, text: body, attachments: verified, status: 'active', createdAt: timestamp, updatedAt: timestamp }; tx.create(`siteSocialPosts/${rid}`, post); tx.create(`${profilePath(user.uid)}/posts/${rid}`, post); const updated = profileCounts(mine, { postsCount: 1 }, timestamp); tx.set(profilePath(user.uid), updated); return { post: { id: rid, uid: user.uid, author: profileDTO(updated), text: body, attachments: verified, createdAt: iso(timestamp), updatedAt: iso(timestamp), canEdit: true } }; });
        return result;
    }
    async function updatePost(user, input) { actor(user); fields(input, ['id', 'text', 'requestId']); const postId = requestId(input.id), rid = requestId(input.requestId), body = text(input.text ?? '', 0, SOCIAL_LIMITS.postText, 'INVALID_POST'); return mutate(user, rid, 'post_update', { id: postId, text: body }, async (tx) => { const existing = await tx.get(`siteSocialPosts/${postId}`); if (!existing || existing.status !== 'active')
        fail('POST_NOT_FOUND', 404); if (existing.uid !== user.uid)
        fail('POST_OWNER_REQUIRED', 403); const mine = await ownProfile(user, tx); if (!body && !(existing.attachments || []).length)
        fail('INVALID_POST'); const updated = { ...existing, text: body, updatedAt: stamp() }; tx.set(`siteSocialPosts/${postId}`, updated); tx.set(`${profilePath(user.uid)}/posts/${postId}`, updated); return { post: { id: postId, uid: user.uid, author: profileDTO(mine), text: body, attachments: existing.attachments || [], createdAt: iso(existing.createdAt), updatedAt: iso(updated.updatedAt), canEdit: true } }; }); }
    async function deletePost(user, input) {
        actor(user);
        fields(input, ['id', 'requestId']);
        const postId = requestId(input.id), rid = requestId(input.requestId);
        const result = await mutate(user, rid, 'post_delete', { id: postId }, async (tx) => { const existing = await tx.get(`siteSocialPosts/${postId}`); if (!existing)
            fail('POST_NOT_FOUND', 404); if (existing.uid !== user.uid)
            fail('POST_OWNER_REQUIRED', 403); const mine = await ownProfile(user, tx); if (existing.status === 'active') {
            const timestamp = stamp(), deleted = { ...existing, status: 'deleted', text: '', deletedAt: timestamp, updatedAt: timestamp };
            tx.set(`siteSocialPosts/${postId}`, deleted);
            tx.set(`${profilePath(user.uid)}/posts/${postId}`, deleted);
            tx.set(profilePath(user.uid), profileCounts(mine, { postsCount: -1 }, timestamp));
        } return { id: postId, deleted: true, cleanupPending: true }; });
        const deleted = await store.get(`siteSocialPosts/${postId}`);
        let cleanupPending = false;
        if ((deleted?.attachments || []).length) {
            try {
                if (typeof media?.remove !== 'function')
                    cleanupPending = true;
                else
                    cleanupPending = (await media.remove(user, deleted.attachments))?.pending === true;
            }
            catch {
                cleanupPending = true;
            }
        }
        return { ...result, cleanupPending };
    }
    async function setFollow(user, input) { actor(user); fields(input, ['uid', 'following', 'requestId']); const peer = id(input.uid), rid = requestId(input.requestId); if (typeof input.following !== 'boolean')
        fail('INVALID_REQUEST'); if (peer === user.uid)
        fail('SELF_ACTION_NOT_ALLOWED'); return mutate(user, rid, 'follow_set', { uid: peer, following: input.following }, async (tx) => { const [mine, target, edge, unavailable] = await Promise.all([ownProfile(user, tx), profile(peer, tx), tx.get(followingPath(user.uid, peer)), blocked(user.uid, peer, tx)]); if (input.following && unavailable)
        fail('CONTACT_UNAVAILABLE', 403); const active = edge?.active === true, timestamp = stamp(); let updatedTarget = target; if (active !== input.following) {
        const delta = input.following ? 1 : -1;
        const updatedMine = profileCounts(mine, { followingCount: delta }, timestamp);
        updatedTarget = profileCounts(target, { followersCount: delta }, timestamp);
        tx.set(profilePath(user.uid), updatedMine);
        tx.set(profilePath(peer), updatedTarget);
        if (input.following) {
            tx.set(followingPath(user.uid, peer), { uid: peer, active: true, createdAt: timestamp });
            tx.set(followerPath(peer, user.uid), { uid: user.uid, active: true, createdAt: timestamp });
        }
        else {
            tx.delete(followingPath(user.uid, peer));
            tx.delete(followerPath(peer, user.uid));
        }
    } return { following: input.following, profile: profileDTO(updatedTarget) }; }); }
    async function listFollows(user, input) { const current = optionalActor(user); fields(input, ['uid', 'kind', 'limit', 'cursor']); const uid = id(input.uid); if (!['followers', 'following'].includes(input.kind))
        fail('INVALID_QUERY'); await profile(uid); const { rows, nextCursor } = await page(`siteSocialFollows/${uid}/${input.kind}`, 'follows', { uid, kind: input.kind }, input, 30); const items = (await Promise.all(rows.map(async (row) => { if (!uidOK(row.uid) || row.active !== true || current && await blocked(current, row.uid))
        return null; return profileDTO(await profile(row.uid, store, false)); }))).filter(Boolean); return { items, nextCursor }; }
    async function listThreads(user, input = {}) { actor(user); fields(input, ['limit', 'cursor']); await ownProfile(user); const { rows, nextCursor } = await page(`siteSocialInboxes/${user.uid}/threads`, 'threads', { uid: user.uid }, input, 30, 'updatedAt'); const items = (await Promise.all(rows.map(async (row) => { if (row.uid !== user.uid || !uidOK(row.peerUid) || row.id !== threadID(user.uid, row.peerUid))
        return null; const [target, thread, contact] = await Promise.all([profile(row.peerUid, store, false), store.get(`siteSocialThreads/${row.id}`), contactState(user.uid, row.peerUid)]); if (!target || !participantsOK(thread, user.uid, row.peerUid))
        return null; const last = thread.lastMessage; if (!last || !uuidOK(last.id) || ![user.uid, row.peerUid].includes(last.senderUid))
        return null; return { id: row.id, peer: profileDTO(target), lastMessage: { id: last.id, text: last.text, senderUid: last.senderUid, createdAt: iso(last.createdAt) }, updatedAt: iso(thread.updatedAt), unread: last.senderUid !== user.uid && row.lastReadMessageId !== last.id, blocked: contact.blocked, blocking: contact.blocking, canMessage: !contact.blocked }; }))).filter(Boolean); return { items, nextCursor }; }
    async function listMessages(user, input) {
        actor(user);
        fields(input, ['uid', 'limit', 'cursor']);
        bounded(input.limit, 40);
        const peer = id(input.uid);
        if (peer === user.uid)
            fail('SELF_ACTION_NOT_ALLOWED');
        await ownProfile(user);
        const target = await profile(peer), tid = threadID(user.uid, peer), thread = await store.get(`siteSocialThreads/${tid}`), contact = await contactState(user.uid, peer);
        if (thread && !participantsOK(thread, user.uid, peer))
            fail('CONTACT_UNAVAILABLE', 403);
        if (!thread) {
            if (input.cursor)
                fail('INVALID_CURSOR');
            return { items: [], nextCursor: null, peer: profileDTO(target), blocked: contact.blocked, blocking: contact.blocking, canMessage: !contact.blocked };
        }
        const { rows, nextCursor } = await page(`siteSocialThreads/${tid}/messages`, 'messages', { uid: user.uid, peer }, input, 40);
        const items = rows.filter(row => [user.uid, peer].includes(row.senderUid)).map(row => messageDTO(row, user)).filter(Boolean).reverse();
        if (!input.cursor && items.length) {
            const latest = items.at(-1).id;
            await store.transaction(async (tx) => { const path = inboxPath(user.uid, tid), own = await tx.get(path); if (own?.uid === user.uid && own.peerUid === peer && own.lastReadMessageId !== latest)
                tx.set(path, { ...own, lastReadMessageId: latest }); });
        }
        return { items, nextCursor, peer: profileDTO(target), blocked: contact.blocked, blocking: contact.blocking, canMessage: !contact.blocked };
    }
    async function sendMessage(user, input) { actor(user); fields(input, ['uid', 'text', 'requestId']); const peer = id(input.uid), rid = requestId(input.requestId), body = text(input.text, 1, SOCIAL_LIMITS.messageText, 'INVALID_MESSAGE'); if (peer === user.uid)
        fail('SELF_ACTION_NOT_ALLOWED'); const tid = threadID(user.uid, peer); return mutate(user, rid, 'message_send', { uid: peer, text: body }, async (tx) => { const [mine, target, contact, thread, ownInbox, otherInbox, existing] = await Promise.all([ownProfile(user, tx), profile(peer, tx), blocked(user.uid, peer, tx), tx.get(`siteSocialThreads/${tid}`), tx.get(inboxPath(user.uid, tid)), tx.get(inboxPath(peer, tid)), tx.get(`siteSocialThreads/${tid}/messages/${rid}`)]); if (contact || thread && !participantsOK(thread, user.uid, peer))
        fail('CONTACT_UNAVAILABLE', 403); if (existing)
        fail('REQUEST_ID_REUSED', 409); const timestamp = stamp(), message = { id: rid, senderUid: user.uid, text: body, createdAt: timestamp }, conversation = { participants: [user.uid, peer].sort(), createdAt: thread?.createdAt || timestamp, updatedAt: timestamp, lastMessage: message }; tx.set(`siteSocialThreads/${tid}`, conversation); tx.create(`siteSocialThreads/${tid}/messages/${rid}`, message); tx.set(inboxPath(user.uid, tid), { uid: user.uid, peerUid: peer, updatedAt: timestamp, createdAt: ownInbox?.createdAt || timestamp, lastReadMessageId: rid }); tx.set(inboxPath(peer, tid), { uid: peer, peerUid: user.uid, updatedAt: timestamp, createdAt: otherInbox?.createdAt || timestamp, lastReadMessageId: otherInbox?.lastReadMessageId || null }); return { message: messageDTO(message, user), threadId: tid }; }); }
    async function setBlock(user, input) { actor(user); fields(input, ['uid', 'blocked', 'requestId']); const peer = id(input.uid), rid = requestId(input.requestId); if (typeof input.blocked !== 'boolean')
        fail('INVALID_REQUEST'); if (peer === user.uid)
        fail('SELF_ACTION_NOT_ALLOWED'); return mutate(user, rid, 'block_set', { uid: peer, blocked: input.blocked }, async (tx) => { const [mine, target, outgoing, incoming] = await Promise.all([ownProfile(user, tx), profile(peer, tx), tx.get(followingPath(user.uid, peer)), tx.get(followingPath(peer, user.uid))]); const timestamp = stamp(); if (input.blocked) {
        tx.set(blockPath(user.uid, peer), { uid: peer, active: true, createdAt: timestamp });
        let mineChanges = {}, targetChanges = {};
        if (outgoing?.active === true) {
            mineChanges.followingCount = -1;
            targetChanges.followersCount = -1;
            tx.delete(followingPath(user.uid, peer));
            tx.delete(followerPath(peer, user.uid));
        }
        if (incoming?.active === true) {
            mineChanges.followersCount = -1;
            targetChanges.followingCount = -1;
            tx.delete(followingPath(peer, user.uid));
            tx.delete(followerPath(user.uid, peer));
        }
        if (Object.keys(mineChanges).length) {
            tx.set(profilePath(user.uid), profileCounts(mine, mineChanges, timestamp));
            tx.set(profilePath(peer), profileCounts(target, targetChanges, timestamp));
        }
    }
    else
        tx.delete(blockPath(user.uid, peer)); return { blocked: input.blocked }; }); }
    async function listBlocks(user, input = {}) { actor(user); fields(input, ['limit', 'cursor']); const { rows, nextCursor } = await page(`siteSocialBlocks/${user.uid}/users`, 'blocks', { uid: user.uid }, input, 100); const items = (await Promise.all(rows.map(async (row) => row.active === true && uidOK(row.uid) ? profileDTO(await profile(row.uid, store, false)) : null))).filter(Boolean); return { items, nextCursor }; }
    return Object.freeze({ getMe, getProfile, updateProfile, searchProfiles, listPosts, createPost, updatePost, deletePost, setFollow, listFollows, listThreads, listMessages, sendMessage, setBlock, listBlocks });
}
