# New: private newspaper

`/taithai/news/` is an unlisted, one-page newspaper. No Google login or browser OAuth is required. The shell and generated icon are public; the archive is AES-256-GCM encrypted. A private pairing JSON contains the feed id and random 256-bit archive key. Import it once per browser; a non-extractable CryptoKey is retained in IndexedDB. Never commit the pairing file, private inputs, source emails, or decrypted edition output. Anyone holding the pairing file can read the archive. Clearing one browser does not revoke copied pairing files; archive-key rotation is required for revocation.

The archive contains real, dated editorial editions written by Codex from accessible source material. Each story has its source and coverage caveats. The history picker only lists actual published editions. Dates use Asia/Bangkok. User tasks and accepted routines are encrypted in device-local IndexedDB; they are not synced across devices.

## Publishing an actual new edition

Keep a private JSON matching the edition schema outside this repository. Preserve dates and source references. Resolve cancellations and changed schedules against newer messages. Record all source/account gaps and uncertainty, including images that could not be read. Do not invent editions or obligations.

```
node scripts/publish-new-edition.mjs /private/path/edition.json /private/path/New-device-pairing.json
node scripts/test-new-archive.mjs
```

The publisher creates a pairing file only when absent, appends the edition without changing old editions, then rewrites the encrypted feed with a fresh nonce. Commit only the encrypted `taithai/news/feeds/*.json` and public app files. Deploy using the existing Vercel pipeline. The app's Update button fetches this archive and selects the latest actual edition; it does not claim to trigger AI processing.

## Remote ingestion: not connected yet

The requested other computer has not been made available to this task. Codex UI cannot be controlled by Computer Use. The user must finish pairing through Codex Connections. No email/Teams refresh worker or cloud-to-Codex job API has been configured. Do not represent the Update button as a live mail/Teams scan until an authenticated request queue and working host-side consumer are implemented and verified. Do not expose an unauthenticated local server or store account tokens on the public site. No API credentials or third-party tokens were added by this implementation.

Initial edition: source account danupol.saen@bumail.net, 22 messages dated Sep 22–29, 2026. Other accounts and direct Teams remain pending; the edition states this explicitly. Previous Firebase user data is left intact; automatic migration is not implemented.

## US short-term stock column

Optional `edition.markets` stores a dated, sourced editorial plan in the same encrypted snapshot. It contains USD closing references, quote and review timestamps, the intended US session, entry ranges, two sell targets, stop levels, conditions, rationale, and explicit limitations. Levels are AI analysis, not an external analyst consensus or live signals. Never represent reference closes as streaming prices. Selling means closing a hypothetical long position; no portfolio holdings are assumed.

`markets.js` rejects invalid price geometry/dates/links, computes reward:risk using the least favorable entry in the range, labels pre-session/expired/historical states, and refreshes that label every minute and when the tab becomes visible. Plans expire for new entries at `validUntil`. Selecting old editions never substitutes a newer market plan. The initial column uses the Sep 28, 2026 closing data from the linked Stock Analysis historical pages; personal mail coverage remains explicitly at its earlier check time.

Run `node scripts/test-news-markets.mjs` for expiry, archival behavior, invalid-data rejection, and ratio calculations. The fixtures in this test are not published as news. An authenticated remote update worker and live market data remain unconfigured.
