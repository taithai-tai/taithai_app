# Taithai membership activation

Operational review: 2026-11-21. The public product is **Taithai membership at THB 99/month**, including one `@taithai.app` email address as a current benefit. Additional email addresses add **THB 99/month each**; for example, membership with two addresses totals THB 198/month before any explicitly configured discount or tax. Membership can gain further benefits, but do not promise an unimplemented benefit. There is no artificial 20-address account limit: capacity follows the server-verified paid quantity and available provider inventory. Checkout uses a `9900`-satang monthly unit Price; only authoritative paid-invoice reconciliation grants the corresponding capacity. Public sales remain disabled during the owner trial.

The owner chose **Hostinger Email** instead of Purelymail and confirmed payment for Starter Business Email with one provider seat. hPanel shows the plan attached to `taithai.app`; its exact order ID, API activation state and available inventory still need a fresh API check after payment. Reach marketing is a separate product and does not supply inboxes. No mailbox has been created, and the owner will register their own address through Taithai. The code retains Purelymail/Migadu compatibility; switching configuration never migrates saved mailboxes or resets passwords. The prepared Netlify route remains available for website hosting. This guide does not authorize another purchase or DNS change.


When migrating the existing AI apps, copy their server-only `OPENROUTER_API_KEY`, `NINEARM_API_KEY` (ACE) and `HEALTHCARE_PASSPORT_KEY` (AI Healthcare) through the host’s encrypted secret settings. Local absence does not prove that the current Vercel deployment lacks these values. Never export secret values into the static build or commit them.



Operational activation status (2026-11-21): both authoritative GoDaddy nameservers and public resolvers returned the owner-approved Hostinger MX, merged SPF and three DKIM CNAMEs; Reach DKIM and DMARC were preserved. The signed-in Netlify dashboard for `taithai5002@gmail.com` was verified, and the owner authorized its GitHub connection. Project import is in progress. Hosting secrets, public membership deployment, live Stripe setup and real message-delivery verification remain unfinished.


## Current activation blockers and costs

Use the Stripe business account explicitly selected by the owner. The user requested an account **other than “meemon”**. The connected account observed during setup was labelled **“New business”**, in test mode and not activated; it is not evidence that the intended business can accept live payments. Confirm the correct business, country, settlement details and activation status before obtaining its live credentials. Do not reuse another business's keys, Prices or webhook secrets.

Provider mailbox inventory is a separate cost from what Taithai charges its members:

| Service | Verified public terms/pricing | Required decision |
| --- | --- | --- |
| Hostinger Email | The owner confirmed payment for **Starter Business Email, one provider seat, THB 63.13/month including tax**, and hPanel shows the plan attached to `taithai.app`. This observed price is not a guarantee for future renewals or capacity additions. | Re-read the exact order/plan through the API and confirm its activation and unused seat. No additional seat purchase is authorized. Reach marketing and Titan are different products. [Hostinger Email configuration](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/), [Mail API overview](https://docs.hostinger.com/emails/mail-api.md) |
| Netlify Free website hosting | Free supports commercial projects within its current 300-credit monthly allowance; exhaustion can pause the site/webhooks. | Website hosting does not supply the mailbox seats. No paid top-ups are implied. [Cost comparison and official sources](membership-cost-options.md) |
| Purelymail alternative | Previously investigated trial; later Simple pricing lists USD 10/year. | The owner rejected this provider for the current setup. Retained compatibility is not a purchase or migration request. [Cost comparison](membership-cost-options.md) |
| Vercel alternative | Hobby is limited to personal/noncommercial use. Pro currently starts at **USD 20/month**, includes one deploying seat and USD 20 usage credit; extra deploying seats, usage and applicable taxes can add cost. | Relevant only if retaining Vercel for the commercial service; the chosen Netlify route avoids this required monthly upgrade. [Terms](https://vercel.com/legal/terms), [Pro pricing](https://vercel.com/docs/plans/pro-plan) |
| Migadu alternative | Mini currently lists **USD 9/month or USD 90/year**, with account-wide 1,000 incoming/day, 100 outgoing/day and 30 GB storage. Mailboxes share these allowances. Micro lacks mailbox-limit settings. | An implemented alternative, not the chosen trial. Check provider fit and shared capacity. Published terms do not state a special-approval requirement for the public paid-mailbox model. [Pricing](https://www.migadu.com/pricing/), [Acceptable use](https://www.migadu.com/use/) |

The table mixes an observed THB Hostinger quote with published USD alternative prices; it is not a currency conversion or an all-in operating-cost estimate. Domain renewal, payment/database fees, taxes and future capacity upgrades are separate. Recheck actual pricing before any purchase. Free hosting can pause at its credit limit, interrupting webmail and webhook access; it is not unlimited hosting. This application receives third-party signup/verification emails and sends human correspondence, not bulk/transactional campaigns. Resolve unclear provider-fit or capacity questions. Hostinger’s actual written-consent requirement for the planned public-member email model is described below; API availability does not establish resale authorization.

## Hostinger public-member service confirmation

Technical support for mailbox automation does not itself grant resale rights. Hostinger’s current English [Terms of Service, Section 6 “General Rules of Conduct,” item 6](https://www.hostinger.com/legal/universal-terms-of-service-agreement) restrict resale or commercial exploitation of Services or portions of them **“without Hostinger's express prior written consent.”** The item is nested under Section 6 rather than labelled with the literal text “6.6.” Its [Reseller master agreement, §2](https://www.hostinger.com/legal/reseller-master-agreement) lists cPanel Shared Hosting reseller programs; it does not itself establish Hostinger Email authorization. Before accepting public membership payments for this email benefit, retain Hostinger’s written confirmation/consent for the actual model and order. Keep public sales disabled until resolved. This is a documented provider requirement, not a claim that an approved arrangement is impossible.

The owner authorized sending this question to Hostinger, and the support conversation reached human specialist **Nadya** on 2026-11-21. The question concerns this model:

> We own taithai.app and plan to operate a public Taithai membership service. Membership is THB 99/month including one real email address, with additional addresses at THB 99/month each. Unrelated paying members would access only their own messages through our web app. We would pay for every required Hostinger Email seat in one order for our domain, provision via your official management API, and use IMAP/SMTP without sharing hPanel credentials. Does Hostinger expressly permit this model under Terms §6.6? Please confirm consent in writing and identify any required reseller agreement, plan, volume limits or API restrictions before we launch.

At the time of the specialist's account check, only Reach was visible; the owner subsequently confirmed the Starter payment. The specialist did not confirm permission for the public paid-member email model and asked for clarification of the cited term. **No written resale consent has been obtained.** Follow up with the exact section/item and the now-purchased order, without treating technical API access as approval.

The official [Email management guide](https://www.hostinger.com/support/4768093-how-to-access-the-email-section-at-hostinger/) requires all addresses on a domain to share one email subscription. The [management API](https://docs.hostinger.com/api-reference/endpoints/mail/mailboxes/create-mailbox) supports automated creation in that order, while [Mail API docs](https://docs.hostinger.com/emails/mail-api.md) document mailbox-content automation and throttling. API tokens inherit account permissions, and repeated excess requests can trigger temporary IP blocking; ordinary plan, storage, sending and API limits still apply.

## Environments, credentials and database

Use a separate [Stripe Sandbox](https://docs.stripe.com/sandboxes) for new development, with separate local/CI configurations. Keep its keys, Price, Customer Portal configuration and webhook signing secret together. Sandbox/test payments must never provision real email. The runtime separates `siteTestMemberships` / `siteTestBilling*` from live `siteMemberships` / `siteBilling*`, namespaces test locks, rejects webhook mode mismatches, and permits real mailbox creation/sending only from a current, paid, unblocked live entitlement. Switching a key is not a data migration.

Firebase project: `gen-lang-client-0141234491`. Named Firestore database: `ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb`. Preserve this named database; do not substitute `(default)`. Use a dedicated server service account with only the required Firebase Auth and database access. Ordinary client SDKs must not read or write membership, billing, mailbox credentials or mail-operation records. Deploy the existing rules/indexes before enabling clients; see [site operations](site-operations.md).

Configure these exact names from [`.env.example`](../.env.example), separately for Preview/Sandbox and Production. Stripe keys/Price/webhook are required for billing tests or sales, **not** to grant the narrowly scoped owner mail trial:

| Variable | Value/purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Environment-specific restricted key, preferably `rk_test_…` / `rk_live_…`; server only. |
| `STRIPE_PRICE_ID` | Price in the same Stripe account/mode: THB 99 monthly unit Price: membership includes one address; each additional address adds one paid unit. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this deployment's webhook endpoint and mode. |
| `STRIPE_PORTAL_CONFIGURATION_ID` | General Customer Portal: payment methods, invoices and cancellation; no plan/quantity changes. |
| `STRIPE_QUANTITY_PORTAL_CONFIGURATION_ID` | Separate, product-scoped quantity confirmation configuration described below. |
| `STRIPE_QUANTITY_UPDATES_VERIFIED` | Default `false`. Set `true` only after the live quantity-update gate below is proven in Sandbox. Independent of initial Checkout. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service-account JSON for the project above. |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Alternative base64 encoding of that JSON; configure one service-account variable. |
| `MAIL_PROVIDER` | `hostinger` for the selected integration; `purelymail` / `migadu` remain alternatives. |
| `HOSTINGER_API_TOKEN` | Hostinger **management API** Bearer token; server only. Not a Reach credential or a content Mail API token. It has the owning account’s permissions, so protect and expire it appropriately. |
| `HOSTINGER_MAIL_ORDER_ID` | Exact existing Hostinger Email order attached to `taithai.app`; no automatic order/seat purchase. |
| `MAIL_DOMAIN` | Exactly `taithai.app`. |
| `PURELYMAIL_API_TOKEN` | Purelymail API token; required only for that provider, server only. |
| `MIGADU_API_USER` | Migadu account user's email; required only for Migadu, server only. |
| `MIGADU_API_KEY` | Migadu API key; required only for Migadu, server only. |
| `MAIL_CREDENTIAL_SECRET` | Persistent, base64-encoded **32-byte** encryption key. |
| `MAIL_READY` | Enable after provider access/domain/DNS readiness for the controlled owner trial; it is separate from public sales. |
| `MEMBERSHIP_SALES_ENABLED` | Keep `false` throughout the trial, including while `MAIL_READY=true`. |
| `OWNER_MAIL_TRIAL_ENABLED` | Explicit server switch for the exact verified owner only; default `false`. |
| `OWNER_MAIL_TRIAL_EXPIRES_AT` | Required future UTC ISO expiry, at most 31 days ahead; recommend seven days. |
| `OWNER_MAIL_TRIAL_MAILBOXES` | Owner-only trial capacity `1` (default) or `2`; actual purchased/trial provider seats are still required. |
| `OWNER_MAIL_TRIAL_ORIGIN` | Optional exact HTTPS `<site>.netlify.app` origin for trial writes before domain cutover; no wildcard. |

Use the host's secret environment-variable storage and function-only scopes; on Vercel use [Sensitive Environment Variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables). Never use a client/public prefix or place values in Git, screenshots, chat, logs or analytics. Back up `MAIL_CREDENTIAL_SECRET` securely: losing or replacing it makes existing mailbox passwords unreadable. Do not regenerate it on deploy or rotate it without a tested migration/recovery plan. New AES-GCM ciphertext binds the owner, address and provider; legacy v1 credentials remain Migadu-only. Changing `MAIL_PROVIDER` fails closed for a saved mailbox from another provider rather than silently sending its password to the new host.

Prefer a [restricted Stripe key](https://docs.stripe.com/keys#restricted-api-keys). The current runtime needs read access to Prices, Subscriptions, Invoices/Invoice Payments, Charges, Disputes and Radar Early Fraud Warnings; it needs write access for Customers, Checkout Sessions, Customer Portal Sessions, Coupons and Promotion Codes. Match the Dashboard's current permission categories and verify all flows in the Sandbox; add only permissions required by an observed denied operation. Product/Price creation, webhook administration and Portal configuration can use separate setup credentials. This runtime does not need transfers, payouts or connected-account administration.

## Stripe configuration and required webhook

Create the exact recurring unit Price and general Customer Portal configuration allowing payment-method updates, invoice history and cancellation at period end. Keep subscription price/plan/quantity changes disabled there. Configure a **separate product-scoped quantity confirmation portal** with `STRIPE_QUANTITY_PORTAL_CONFIGURATION_ID`; the application validates the intended quantity and provider capacity before opening that flow. A requested quantity or Checkout/Portal return URL grants no immediate capacity: unpaid increases remain pending until the matching paid invoice proves them. Recheck the actual configuration against the billing source and Sandbox regressions before launch. Discount creation/disable controls belong only to the verified owner account `taithai5002@gmail.com`.

**Live quantity-update gate:** keep `STRIPE_QUANTITY_UPDATES_VERIFIED=false` until the checks below pass. Resuming the same target keeps its pending reservation until payment is reconciled. Cancel/back navigation does not establish session expiry; never release holds using a guessed Portal lifetime. Before enabling live quantity updates, verify in Stripe Sandbox that stale or duplicate, unconsumed confirmation links cannot reduce the native Stripe subscription quantity after a newer increase has been paid. Inspect the subscription and invoice state, not only the application display. If that behavior cannot be established, keep quantity upgrades disabled or replace the confirmation flow with one whose old authorizations can be revoked. Initial quantity selection through Checkout is unaffected by this separate upgrade gate.

Register `https://taithai.app/api/membership-webhook/` in the intended account/mode, using the API version pinned in source (`2026-11-18.endive`). Verify a signed POST reaches the handler without any 3xx redirect; the deployment uses trailing slashes. Configure every event currently handled in `server-lib/site-billing.js`:

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.subscription.pending_update_applied
customer.subscription.pending_update_expired
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
radar.early_fraud_warning.created
```

The last five are the implemented refund/dispute/fraud-risk events. Webhooks are required, signature-checked against the raw body, mode-checked and deduplicated. Entitlement comes from authoritative subscription/invoice reconciliation, not the Checkout return page. Risk events can block new mailbox creation/sending and appear for owner review; partial refunds are reviewed rather than automatically treated as fully refunded. Preserve their invoice/risk proof and inspect unresolved mappings. Test duplicate and out-of-order delivery, renewals, payment failure/action-required, cancellation, refunds, dispute status changes and fraud warnings. Use Stripe's Sandbox fixtures; do not generate real charges/refunds/disputes for an unapproved test.

Stripe Tax is not enabled by this integration. Before changing that, review the business's actual tax settings, supported jurisdictions, product tax code, confirmed registrations and inclusive/exclusive price treatment. Do not enable automatic tax or add registrations by guesswork; a Stripe account alone is not a tax registration. [Stripe Tax setup](https://docs.stripe.com/tax/set-up)

## Real-mail setup and readiness

For Hostinger Email, first obtain the actual active order for `taithai.app` and securely configure its management token and exact order ID. The adapter uses the [published Hostinger OpenAPI](https://developers.hostinger.com/openapi/openapi.json): read-only `GET /api/mail/v1/orders?domain=taithai.app`, `GET /orders/{orderId}/plan` and paginated `GET /orders/{orderId}/mailboxes`; creation is only `POST /orders/{orderId}/mailboxes` with `local_part` and a server-generated password. It never buys a plan/seat, changes an existing password, adopts an external mailbox or deletes one. IMAP authentication using the previously persisted random password proves ownership after an uncertain create response.

The owner-approved six DNS changes were saved at GoDaddy and verified on 2026-11-21 against both authoritative nameservers (`ns57`/`ns58.domaincontrol.com`) and public resolvers `1.1.1.1`/`8.8.8.8`: **`mx1.hostinger.com` priority 5**, **`mx2.hostinger.com` priority 10**, the single merged SPF `v=spf1 include:secureserver.net include:_spf.reach.hostinger.com include:_spf.mail.hostinger.com -all`, and the three `hostingermail-a/b/c._domainkey` CNAMEs pointing to their matching `hostingermail-a/b/c.dkim.mail.hostinger.com` targets. Old GoDaddy MX routes were removed; existing Reach DKIM and `p=reject` DMARC were preserved. This observed DNS convergence does not establish mailbox activation or end-to-end delivery. Do not add duplicate SPF records or alter restrictive DMARC by guesswork. [Official MX guide](https://www.hostinger.com/support/4407237-hostinger-email-mx-records/). TLS endpoints are `imap.hostinger.com:993` and `smtp.hostinger.com:465`; TLS connectivity was checked without mailbox authentication. This adapter targets Hostinger Email, not Titan (`imap.titan.email`) and not Reach.

`provider.assertReady()` verifies the configured token can see the exact active, unexpired order for `taithai.app`, positive purchased seats and an IMAP-compatible plan with adequate message/recipient limits. The published order schema contains **no DNS-ready/send-ready Boolean**, so the adapter does not invent one. Runtime additionally checks the exact public MX set; actual inbound/OTP and outbound delivery still require owner-trial tests. `provider.inventory()` reports purchased seats, plan mailbox quota, all existing mailboxes and available slots. `assertCapacity(n)` fails closed if capacity is insufficient, pagination/schema is incomplete, or API access is unavailable. Public checkout/quantity increases reserve actual available inventory; mailbox creation checks it again. Unknown create outcomes retain their reservation. The server-only `siteMailCapacityHolds/{uid}` ledger reserves paid-but-uncreated and pending-checkout/quantity capacity across customers. Pending Portal holds are retained until authoritative payment reconciliation or explicit operator review; no guessed expiry releases them. Checkout holds are released only after a verified expired Stripe session. Do not erase holds or assume a browser cancellation released one. Out-of-band hPanel changes and shared provider sending/storage limits still require operational monitoring.

If choosing Purelymail later, use its actual domain instructions and unique ownership record. The [official DNS guide](https://support.purelymail.com/support/solutions/articles/159000360245-how-to-set-up-your-custom-domain-dns-records) documents:

- One MX `mailserver.purelymail.com`, priority 50; SPF includes `_spf.purelymail.com`.
- `purelymail1`, `purelymail2`, `purelymail3` DKIM CNAMEs under `_domainkey`, targeting `key1/2/3.dkimroot.purelymail.com`; the documented DMARC CNAME is `_dmarc` → `dmarcroot.purelymail.com`.
- The real `purelymail_ownership_proof=…` TXT value comes from the owner's account, never from an example.

Disable **Symbolic Subaddressing** for `taithai.app` before allocating mailboxes. Otherwise Purelymail can ignore dots or route symbols such as `_`/`-` as tags, violating the intended independent address names. No adapter changes this setting automatically. Review account routing/Sieve rules and prove two-user delivery isolation. [Official routing rules](https://purelymail.com/docs/routing)

Purelymail readiness calls the documented `POST /api/v0/listDomains` with `includeShared:false`, requiring exactly the owned nonshared `taithai.app`, `symbolicSubaddressing:false`, and `dnsSummary.passesMx/passesSpf/passesDkim/passesDmarc` all Boolean `true`. API access uses the `Purelymail-Api-Token` header. Creation uses `createUser`, not aliases. An uncertain creation is recovered only by authenticating with the previously stored random password, never by adopting an existing address or resetting its password. The published `listUser` API caps results at 1,000; absence at that cap fails closed for operator review. [Official API](https://news.purelymail.com/api/index.html)

If explicitly choosing Migadu instead, get its **actual domain records** using the [official API](https://www.migadu.com/api/) `GET /v1/domains/taithai.app/records`. Its pattern is:

- MX `aspmx1.migadu.com`, priority 10, and `aspmx2.migadu.com`, priority 20.
- One merged SPF record containing `include:spf.migadu.com`; preserve any other genuinely required senders.
- `key1`, `key2`, `key3` DKIM CNAMEs under `_domainkey`, targeting the exact domain-specific records Migadu supplies, plus the supplied ownership-verification and DMARC records.

Review existing DNS before changing anything. Do not leave obsolete MX routes mixed with the chosen provider. Copy actual verification values. The fixed TLS endpoints are `imap.purelymail.com:993` / `smtp.purelymail.com:465`, or `imap.migadu.com:993` / `smtp.migadu.com:465` for Migadu. Protocol credentials use the saved provider and refuse a configuration mismatch. SMTP From/envelope sender stays fixed to the authenticated mailbox, even if a provider account supports wider Send-As. No mailbox password or external mail-client login is offered to clients.

The live Checkout preflight verifies the selected provider's exact public MX set and calls `provider.assertReady()`. Migadu's read-only domain GET requires `name: "taithai.app"` and Boolean `can_send`, `can_receive`, `can_access` all `true`; its undocumented `/diagnostics` JSON is not guessed. Provider probes verify documented readiness, not delivery to every destination.

Use staged switches to avoid blocking the very test needed to verify delivery:

1. While account/domain/DNS/API setup is incomplete: `MAIL_READY=false`, `MEMBERSHIP_SALES_ENABLED=false`, owner trial disabled.
2. After provider/plan access and DNS readiness pass, securely back up the encryption key. For controlled real testing, set `MAIL_READY=true`, `OWNER_MAIL_TRIAL_ENABLED=true` and the short future expiry while keeping **`MEMBERSHIP_SALES_ENABLED=false`**. The runtime grants only verified `taithai5002@gmail.com` an expiring `ownerTrial:true`, `paid:false` capability; no client flag, Sandbox card or ordinary account can grant it. This permits that owner to create the configured one or two real mailboxes and send test mail without charging Stripe; it does not label the trial paid or bypass provider inventory.
3. Verify external receive/OTP/link emails, delivery, Sent-copy and tenant isolation using authorized test identities. If a check fails, keep sales disabled and resolve it; do not buy or activate public sales implicitly.
4. Only after successful real tests, correct Stripe business activation and owner approval of ongoing costs, configure live billing and enable `MEMBERSHIP_SALES_ENABLED=true`. Disable/let expire the trial. Normal customers still require current paid live entitlement. Trial expiry never deletes the mailbox or its messages.

A format-valid API token or passing fixture test is insufficient. Starter payment and domain attachment are observed, but post-payment API activation/inventory and real delivery remain unverified. No mailbox has been created; the owner will register their own address through the website. These stages are prepared instructions rather than a claim of working end-to-end mail service.

## Product limits and recovery behavior

Each member can add the number of immutable email addresses covered by the verified paid entitlement, without an artificial account-quantity ceiling; reserved names and conflicting/existing provider addresses cannot be claimed. Outgoing limits are **20 messages/day per mailbox, five recipients/message**, 200 subject characters and 20,000 body characters; provider-wide limits also apply. Incoming views are plain text, paginated to 25 messages, with bounded body retrieval and at most 100,000 displayed text characters. Attachments expose metadata only: **sending/downloading attachments is not implemented**. Confirm these limitations before payment.

A configured real mailbox can be supplied as the email address on third-party registration forms; verification mail is then read in `/mail/`. HTML-only verification emails are converted to text with case-preserved codes and explicit HTTP(S) links, without executing HTML or loading images, tracking pixels, CSS or scripts. Token query strings/fragments are preserved; links may still redirect or track a user who deliberately opens them. Empty plain-text alternatives fall back to HTML text. Image-only codes/attachment downloads, unsupported character sets, oversized/deeply nested content and relative links without an absolute origin have limits; there is no OCR or guessed link origin. External websites control their own domain acceptance, delivery and token expiry, so compatibility with every website cannot be guaranteed.

When paid quantity falls below the number of existing boxes, the stable oldest-created allocation can send; excess boxes become read/manage-only. Expiry/cancellation never deletes, suspends or recycles any mailbox. Verified owners can continue reading, marking and moving their existing messages to Trash; new creation/sending requires a paid active entitlement or the narrowly scoped, unexpired owner trial above. A provisioning timeout retains the reserved address/encrypted credential; retry the same name after its lease expires. Do not reset another existing provider mailbox to recover a reservation.

The current ordered owner index remains subject to Firestore’s document-size limit, and Hostinger inventory enumeration retains bounded time/response safeguards. These are infrastructure limits, not a membership tier capped at 20 addresses; plan a paged-index migration before the index approaches its storage limit. Record reads are batched at 25 concurrent requests. Do not market provider seats or storage as unlimited.

The first/legacy mailbox keeps `siteMailboxes/{uid}` and its existing ID/ciphertext. Additional boxes use `siteMailAccounts/{mailboxId}`; `siteMailUserAccounts/{uid}.mailboxIds` is the owner-only ordered index. Every operation verifies the authenticated UID against the selected record. When there is more than one box, selection is required; message IDs and pagination cursors bind that selection. All these server collections, global address reservations and `siteMailCreateJobs` must remain client-denied. There is no automatic provider migration.

Sending uses an immutable per-user request ID, selected mailbox and payload fingerprint. Unconfirmed SMTP acceptance remains pending/uncertain and is never automatically resent. Checking an existing receipt works after expiry/provider outage without SMTP; accepted messages are not resent to repair a failed Sent copy. Partial acceptance identifies rejected recipients. A fresh request ID can send again, so inspect the original receipt/Sent folder before explicitly discarding an uncertain request. Pending browser payloads are stored in that tab's session storage for recovery; signing out hides message UI but does not silently discard this pending identity.

## Locks, retention and final activation review

Billing locks use a two-minute renewable lease, renewed every 30 seconds and released by the matching token. A stale lease can be reclaimed transactionally. Optional Firestore TTL can target native `expireAt` timestamps on `siteMembershipLocks` and `siteMembershipRateLimits`; configure and verify TTL deliberately. It is not enabled merely by deploying this code. Mail quota `expiresAt` and send-job `expiresAt` values are ISO strings, not configured Firestore TTL fields.

Do not blanket-purge billing event/invoice/risk proof, address reservations, owner indexes, create-job identities, provider capacity holds or encrypted mailbox records. Do not delete pending/uncertain send jobs. Deleting an old terminal receipt can permit replay of its request ID; any future cleanup must retain a durable idempotency tombstone before removing details. There is no automatic mailbox expiry deletion or scheduled bulk cleanup. Handle verified privacy requests through owner review with an explicit retention/deletion decision.

Before asking for live credentials/cost approval, retain this reviewable checklist:

1. Re-read the purchased Hostinger Starter order through the API and confirm its exact ID, active state, domain and unused provider seat. Payment was confirmed by the owner; no further purchase is authorized. DNS was saved and publicly verified. Keep `MAIL_READY=false` until provider readiness passes and keep public sales disabled throughout the owner trial; no automated seat purchase is implemented.
2. Confirm the named database, client-deny rules/indexes, server identity, restricted-key permissions and encrypted-key backup.
3. Run billing/mail/frontend/router regressions and a build. Verify the 21 webhook selections, both Portal configurations, quantity/invoice-proof behavior, including quantities above 20, provider inventory reservations, two-box isolation and test/live separation. Sandbox entitlement must not create real mailboxes.
4. When the owner resumes signup, configure provider/DNS access, enable only the bounded owner trial with sales disabled, then complete the real-mail checks above. Keep sales unavailable throughout this trial.
5. After real-mail verification and a separate launch/cost decision, configure the correct activated live Stripe account's Price/Portal/webhook and production secrets. Confirm every signed webhook POST reaches the handler without redirects; recheck owner-only discount access and cross-user mail denial.
6. Enable sales for a **separately approved** controlled live checkout/cancellation check, confirm webhook-backed entitlement and delivery, then enable public promotion. Re-disable sales if any delivery, provider, account or cost question remains unresolved.


## Netlify preview checks before domain cutover

Use the committed `netlify.toml`: Node 22, static `public` output, explicit Node Functions and the global uncached Edge access gate. `NETLIFY_NEXT_PLUGIN_SKIP=true` prevents accidental Next SSR adaptation of this static multi-app repository. Never enable Split Testing, which skips the Edge gate. The Edge gate continues canonical API requests without awaiting their response; each Node wrapper separately repeats access checks and adds security/cache headers, avoiding the Edge response-header deadline.

Before logging in on a preview, add only its exact trusted hostname to the existing Firebase project's Authentication authorized domains. This is an authentication configuration change; do not use a wildcard or move the named database. Configure `OWNER_MAIL_TRIAL_ORIGIN` to that exact HTTPS `<site>.netlify.app` origin. Its exception permits only verified-owner trial mail creation/sending/message management, not checkout, Portal or discount mutations. Canonical production URLs remain `https://taithai.app`.

Copy existing application secrets securely into the new host so the other apps retain their integrations; do not expose them in Git, client code, logs or chat. After the site is created, verify actual Netlify function bundling, TLS, Firebase sign-in, signed webhook bytes and every protected static/API alias before switching the website DNS. Local unit tests/static builds are not evidence of a successful cloud deployment. A free host reaching its credit cap can pause the website and webhook endpoint even while the mail provider continues receiving messages.
