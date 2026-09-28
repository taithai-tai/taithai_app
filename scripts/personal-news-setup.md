# Personal newspaper

Route: `/taithai/new` (Vercel's existing trailingSlash policy redirects to `/taithai/new/`). Intentionally absent from the app launcher. User data is behind the existing Firebase Auth session and the existing owner-only `users/{uid}` rule. No data from connectors is embedded in deployed assets.

## Required production account configuration

- Enable Google Calendar API and Gmail API in the Firebase project's Google Cloud project.
- Configure the existing OAuth consent screen to request `calendar.events.readonly` and `gmail.readonly`. Google may require verification for the Gmail restricted scope; while testing, explicitly add the account as a test user. Do not bypass Google's access warnings.
- The user signs in to Taithai, adds email addresses privately, then grants read access to each account. A separate in-memory Firebase Auth instance keeps connected accounts isolated from the owner session. Tokens stay in page memory, are cleared on logout and require reconnection when expired or after reload. Background processing while the page is closed is not implemented.
- Gmail scans all pages of the account's mailbox except spam/trash, including read and archived mail. It reads metadata/snippets and ranks by explicit keywords and recency, showing up to 20 candidates from the last 30 days. This is heuristic filtering, not an AI summary or guaranteed deadline extraction. Incremental refresh reads the last two days. Historical deletions/label changes require a fresh page scan.
- Calendar displays today's primary calendar, with pagination and cancellation filtering. Additional calendars are not queried.
- The Microsoft connector reads Outlook mail and the primary calendar via Microsoft Graph. Enable microsoft.com in Firebase Auth using an approved Entra application with Mail.Read, Calendars.Read and User.Read delegated permissions. Teams messages and education assignments are not integrated. Account consent and end-to-end connection remain unverified.
- Tasks and accepted routines are transactionally saved in the existing private user document under `dailyPaper`; no changes to security rules are required. Storage failure is shown and not represented as success.
- Weather is live Open-Meteo forecast data for central Rangsit and Don Mueang, with day validation and source attribution. It is not flood-alert data. Official alerts are linked but not automatically ingested. Multi-account email addresses are not embedded into the public source; they are configured after owner login.

Validation: `node scripts/test-personal-news.mjs`, `node --check taithai/new/app.js`, `npm run build`. End-to-end OAuth and Firestore validation requires the owner's account and consent. Never claim the account is connected before that succeeds.
