# Taithai website operations

## Production routes
Settings `/settings/`; account `/account/`; help `/help/`; private support `/support/`; data notice `/privacy/`; about `/about/`; owner dashboard `/admin/`. The homepage and all ten apps link to the shared service pages. Movie Memory retains its separate app settings.

## Owner access
Sign in through the existing Google/Firebase provider using the owner's verified email. Both the UI helper and Firestore `siteAdmin()` gate the exact owner address configured in source. Frontend visibility is not the access boundary: Firestore denies report/analytics reads to unauthorized accounts even when called directly. To change ownership, update `firestore.rules`, the site-data/admin helpers, their tests and redeploy rules. No new password or token is put in frontend code.

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

## Private Drive configuration
Private Drive access URLs and internal connection addresses are stored in `sitePrivateConfig/privateDrive`, not HTML, JavaScript, attributes or committed build artifacts. Only the verified owner can get that document. All clients, including the owner client, are denied list/write operations. Configuration is maintained with project-administrator access, outside the public source tree. The website loads these values only after owner sign-in and never tracks their runtime links or copy controls.

The previous repository history contained older connection links. This release removes them from current public source; it does not rewrite Git history, rotate the external share link or change the underlying file server. Rotate/revoke the old external link separately if its historical exposure is a concern.
