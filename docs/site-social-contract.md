# Social service contract

All writes require a verified Firebase token (`uid`, `email_verified: true`) and a UUID `requestId`. Unknown fields are rejected. Public DTOs never contain account emails or private account data. All public profiles require explicit setup; signing in alone does not publish a social profile.

`createSocialService({store, auth, media, now, uuid})` uses get/set/create/delete/list/transaction. `list(collectionPath, {where, limit, orderBy, startAfter})` supports nested collections and returns rows including `id`. Transactions expose get/set/create/delete and must read before writing.

Methods and return shapes:

- `getMe(user)` → `{profile: Profile|null, defaults:{displayName,photoURL,handle}, limits:{postText:3000,messageText:4000,maxAttachments:4,imageBytes:10485760,videoBytes:104857600}}`
- `getProfile(user|null,{uid?,handle?})` → `{profile:Profile,viewer:{isSelf,following,blocked,blocking,canMessage}}`
- `updateProfile(user,{handle,displayName,bio,photoURL?,requestId})` → `{profile,replayed}`. Handle is unique lowercase `[a-z0-9_]{3,24}`. Shared legacy username reservations are created when absent; existing matching legacy records stay untouched. Avatar may be current verified Google photo or blank. Same handle can be retained; old handles stay reserved to prevent impersonation.
- `searchProfiles(user|null,{q,limit?,cursor?})` → `{items:Profile[],nextCursor,query}`. Search two or more characters by handle/name prefix; no email search. Max20; search returns one bounded page (`nextCursor:null`).
- `listPosts(user|null,{uid?,limit?,cursor?})` → `{items:Post[],nextCursor}`. Without uid: public timeline. Max20. Deleted posts are omitted; a cursor can still be present with an empty page.
- `createPost(user,{requestId,text,attachments:Attachment[]})` → `{post,replayed}`. `id=requestId`; text or attachment required, up to4 images or1 video.
- `updatePost(user,{id,text,requestId})` → `{post,replayed}`. Only author; edits text, keeps attachments.
- `deletePost(user,{id,requestId})` → `{id,deleted:true,cleanupPending,replayed}`. Only author. Hides immediately; failed media cleanup is reported and can be retried with same requestId.
- `setFollow(user,{uid,following,requestId})` → `{following,profile,replayed}`
- `listFollows(user|null,{uid,kind:'followers'|'following',limit?,cursor?})` → `{items:Profile[],nextCursor}`. Max30.
- `listThreads(user,{limit?,cursor?})` → `{items:Thread[],nextCursor}`. Max30. Only caller's inbox.
- `listMessages(user,{uid,limit?,cursor?})` → `{items:Message[],nextCursor,peer:Profile,blocked,blocking,canMessage}`. Max40. Latest page ascending chronological; cursor loads older page. GET never creates a thread. Existing messages remain readable after blocking; sending stops.
- `sendMessage(user,{uid,text,requestId})` → `{message,threadId,replayed}`. Exact retry fingerprint; no duplicate messages. Both accounts must have public profiles, neither side blocked.
- `setBlock(user,{uid,blocked,requestId})` → `{blocked,replayed}`. Blocking removes follow relationships in both directions and stops further follow/DM, without deleting public posts or prior messages.
- `listBlocks(user,{limit?,cursor?})` → `{items:Profile[],nextCursor}`. Only caller's list, max100 per page.

Profile: `{uid,handle,displayName,bio,photoURL,followersCount,followingCount,postsCount,createdAt,updatedAt}`.
Post: `{id,uid,author:Profile,text,attachments:[{path,type,size,name,url}],createdAt,updatedAt,canEdit}`.
Message: `{id,senderUid,text,createdAt,isMine}`.
Thread: `{id,peer:Profile,lastMessage:{id,text,senderUid,createdAt},updatedAt,unread,blocked,blocking,canMessage}`.

Media injection:
`media.validate(user, attachments, {postId})` verifies an owned, completed Netlify Blobs upload manifest and returns canonical attachments. Paths remain `social-media/{uid}/{postId}/{assetUUID}.{jpg|png|webp|gif|mp4|webm}`. Canonical public URLs are exactly `https://taithai-app.netlify.app/api/social-media/?id={assetUUID}`. No arbitrary external URL or Firebase token is accepted. The optional `media.assertPublishable(user, attachments, {postId}, transaction)` hook is implemented by the real Blob provider and runs inside post creation's transaction, before any writes; it closes the completion/abandon/publication race. `media.remove(user,attachments)` marks owned manifests as deleting before physical chunk cleanup and returns `{pending:true}` when retries are required.

Media upload API (`/api/social-media/`):

- Authenticated GET `?action=health` reads one fixed missing Blob key and returns `{ready:true,provider:'netlify',limits}`. A public social profile is not required, and no uploads or profile documents are created.
- POST JSON `?action=start` with `{path,type,size,name}` returns `{upload:{path,type,size,name,chunkSize:3145728,totalChunks,uploaded:[indices],uploadedDigests:{index:sha256},complete}}`. Requires the caller's active social profile. Exact retries resume; metadata cannot be replaced. Before skipping any acknowledged chunk after reload, clients must compare its local SHA-256 with `uploadedDigests[index]`; matching name/type/size alone is insufficient. Only acknowledged owned chunks expose digests.
- POST binary `?action=chunk&path=...&index=N` uses `application/octet-stream`, Bearer authorization and a permitted Origin. Each chunk is exactly 3MiB except the final chunk. SHA-256 is computed on the server, persisted before sending bytes, and retried immutably. Return shape is `{upload:...}`. Upload chunks sequentially within one asset; independent assets can run in parallel. A held lease returns `OPERATION_IN_PROGRESS`409 for a retry with the same bytes.
- POST JSON `?action=complete` with `{path}` validates all chunk metadata and the actual first chunk/file signature, then returns `{attachment:{path,type,size,name}}`.
- POST JSON `?action=abandon` with `{path}` returns `{abandoned:true,pending}`. It refuses media referenced by an active post; unpublished or deleted-post media can be cleaned up.
- Public GET/HEAD `?id={assetUUID}` serves only a completed manifest referenced by an active public post and active author. HEAD returns full file size. Range requests return bounded206 responses up to3MiB, with Content-Range/Content-Length/Accept-Ranges exposed through CORS. Images up to10MiB are prefetched and streamed below the Function response limit. Video GET without Range above18MiB returns416 with Accept-Ranges, so clients must use Range playback or bounded-range download to a Blob URL. New reads stop as soon as the post is hidden; no CDN caching is used.

The Netlify SDK store is opened lazily using automatic platform authentication and strong consistency. No new credentials, paid plan or Firebase Storage rules are needed. Site-wide Blob storage is separate from individual deploy lifetimes. Files are split into bounded objects; upload metadata remains server-only in `siteSocialMedia/{assetUUID}`.

Error codes include AUTH_REQUIRED(401), VERIFIED_ACCOUNT_REQUIRED(403), PROFILE_REQUIRED(409), PROFILE_NOT_FOUND(404), HANDLE_TAKEN(409), HANDLE_RESERVED(409), INVALID_HANDLE(400), INVALID_REQUEST(400), INVALID_PROFILE(400), INVALID_POST(400), INVALID_MEDIA(400), POST_NOT_FOUND(404), POST_OWNER_REQUIRED(403), CONTACT_UNAVAILABLE(403), SELF_ACTION_NOT_ALLOWED(400), REQUEST_ID_REUSED(409), INVALID_CURSOR(400).

For public profile viewer metadata, `blocked` and `blocking` both mean the caller’s own block. For private message/thread metadata, `blocked` means either party has blocked contact, while `blocking` means only the caller’s own block and controls whether Unblock can be shown.

Storage: siteSocialProfiles, siteSocialHandles, siteSocialPosts (global plus siteSocialProfiles/{uid}/posts mirrors), siteSocialFollows/{uid}/followers|following/{peer}, siteSocialBlocks/{uid}/users/{peer}, siteSocialThreads/{sha256}/messages/{requestId}, siteSocialInboxes/{uid}/threads/{threadId}, siteSocialRequests/{sha256(actorUid+requestId)}. No client Firestore access is required.
