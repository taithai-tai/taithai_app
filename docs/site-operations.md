# Taithai website operations

## Production routes
Settings `/settings/`; account `/account/`; help `/help/`; private support `/support/`; data notice `/privacy/`; about `/about/`; owner dashboard `/admin/`. The homepage and all ten apps link to the shared service pages. Movie Memory retains its separate app settings.

## Owner access
Sign in through the existing Google/Firebase provider using the owner's verified email. Both the UI helper and Firestore `siteAdmin()` gate the exact owner address configured in source. Frontend visibility is not the access boundary: Firestore denies report/analytics reads to unauthorized accounts even when called directly. To change ownership, update `firestore.rules`, the site-data/admin helpers, their tests and redeploy rules. No new password or token is put in frontend code. Dashboard and app-management navigation starts hidden in HTML and is shown only after Firebase restores the verified owner. The shared owner-UI guard hides links on sign-out, account changes and page-cache suspension; hiding links is separate from the Firestore access boundary.

## Data collections
- `siteReports`: acknowledged, private report submissions, optional guest identity, app/type/subject/details/steps/expected/contact, status/public reply and server timestamps
- `siteEvents`: opt-in bounded page views, app opens, developer-defined control identifiers, preference changes, active-time heartbeats and device category; authenticated identity comes from Firebase
- `siteAdminAudit`: immutable status/reply history for changes through the admin transaction

Reports have open/in_progress/resolved/closed states. Signed-in reporters can read their own reports and replies. Guests receive a receipt but cannot enumerate or attach a previous guest report to an account. The browser keeps the form snapshot and stable ID during unconfirmed delivery. Retrying the same pending request does not create another report.

## Deploy
The GitHub main branch continues to trigger the existing Vercel project. `npm run build` preserves its normal production bundler. For restricted local environments only, `TAITHAI_BUILD_BUNDLER=webpack npm run build` uses Webpack to make the same export.

Deploy database rules and indexes independently before publishing clients that use new collections:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project gen-lang-client-0141234491 --non-interactive
```

Keep the existing named database in firebase.json. Existing movie/profile/public-file rules are preserved. Indexes include reporter UID+createdAt and report status+createdAt. No administrator secret is required in Vercel environment variables.

## Tests
`npm run test:site` runs dependency-free UI/data/consent regressions, actual QR decoding and ACE generated-route checks.

The rules suite uses an isolated demo Firebase project. Install test-only `@firebase/rules-unit-testing` and `firebase` under `/tmp/taithai-rules-test`, start a Firestore emulator using the current rules and a Java21 runtime, then run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:site:rules
```

The suite refuses non-local emulator endpoints. It tests anonymous reports, spoofed identities, report ownership, exact verified owner access, schema limits, list limits, immutable analytics/audits, atomic audit transitions and original app permissions.

## Measurement limits
Tracking starts only after consent. Declining does not block tools. No private form values, chat text, file contents, queries, URL fragments or access codes are collected. Admin pages do not track themselves. Account identity is included only when the consented visitor is signed in; guests remain anonymous session IDs, not inferred people. Anonymous and authenticated identity groups can overlap in one visit.

Metrics describe loaded records, with bounded pagination; they are not guessed lifetime totals. Active time is approximate, based on visible activity and bounded heartbeats. Abrupt browser termination, offline use, blockers and declined consent can omit events. Historical usage from before deployment is unavailable. Data is not silently replayed forever or backfilled.

No automatic retention/TTL or bulk-delete workflow is claimed. Privacy requests enter the support inbox for owner review. To remove a verified record, use the Firebase console with project-administrator access; ordinary clients cannot delete reports/events.

Preferences use only `taithai.preferences.v1` and the legacy language key. Appearance import/reset never clears movies, files, Drive codes, analytics consent or app records. Local draft reports stay in the same browser until submitted or cleared.

## Recovery
A failed module load offers retry. Offline pages show the connection state. Report success is shown only after server acknowledgement; uncertain timeouts are kept distinct. 404 pages offer home/help/support and an explicit older-shortlink recovery action. Chordly cache cleanup is scoped to its own prefix. QR Reader uses native detection first, then the vendored Apache-2.0 jsQR decoder without sending images to a third party.

## App visibility and owner testing

Open `/admin/#apps` with the verified owner account, or follow the owner-only shortcut in Settings. Each editable app has three modes:

- **Public**: listed in the collection and available to visitors
- **Unlisted**: removed from discovery; direct links continue to work
- **Owner testing**: removed from discovery; fresh app page, asset and website API requests require the verified owner

Changes are drafts until **Save visibility** succeeds. Cancel discards the draft. A revision check prevents a second window from silently replacing newer settings. Unconfirmed saves can be checked against the stored version. Private Drive remains locked to its existing owner-only policy. A missing settings document retains the original public apps and owner-only Private Drive; malformed settings or unavailable policy reads close app requests instead of assuming public access.

The single `siteConfig/appVisibility` document contains only app identifiers, visibility, revision and update metadata. It is publicly readable at that exact document path; listing is denied. Firestore permits schema-checked, revision-incrementing writes only by the verified owner. No private connection addresses are included. Deploy the rules before the web client/proxy.

Vercel's framework-independent `proxy.js` runs before its static cache and uses the same catalog as the UI. Private app requests require an HttpOnly, Secure, SameSite cookie derived from the existing Firebase ID token. The server verifies identity with Firebase, checks the exact owner, and limits the cookie to the token's remaining lifetime. The shared auth module refreshes this session and clears pending cookie grants before signing out. `/app-access/` handles sign-in, retry and safe return links. The local server uses an HTTP-only development cookie on localhost, never on remote HTTP origins.

Homepage search, app counts, hero shortcuts, help guides, app-specific settings and support choices follow the saved policy. Explicitly selected support topics remain available for reporting a known app. Refresh or focus the page after a visibility change. No apps are silently switched by installing this feature.

This controls website discovery and new requests. It does not erase source or offline copies already delivered to a visitor, or change access to previously published movie/file data and externally shared storage links. Those retain their separate existing data rules. Updated service workers do not replay cached app navigations when they cannot check current access.

## Private Drive configuration
Private Drive access URLs and internal connection addresses are stored in `sitePrivateConfig/privateDrive`, not HTML, JavaScript, attributes or committed build artifacts. Only the verified owner can get that document. All clients, including the owner client, are denied list/write operations. Configuration is maintained with project-administrator access, outside the public source tree. The website loads these values only after owner sign-in and never tracks their runtime links or copy controls.

The previous repository history contained older connection links. This release removes them from current public source; it does not rewrite Git history, rotate the external share link or change the underlying file server. Rotate/revoke the old external link separately if its historical exposure is a concern.
