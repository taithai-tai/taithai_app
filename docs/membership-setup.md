# Private administrator mail

Current scope, 2026-11-21: payment work is cancelled. Mail is a permanent private capability for the verified owner `taithai5002@gmail.com` and accounts to which that owner explicitly grants the `mail` permission. There is no subscription, paid status, trial, assumed expiry or advertised mailbox entitlement. The historical `membership` API name remains for compatibility. Checkout, quantity changes, billing Portal, discounts and payment webhooks return `BILLING_DISABLED`, even if old Stripe keys or sales flags are present. The active runtime does not instantiate Stripe.

## Authorization and isolation

The owner is immutable and must present a verified, non-revoked Firebase ID token. Only the owner may grant, change or revoke admins. Delegation binds an existing verified, enabled Firebase account's UID and normalized email to an active server-only `siteAdminGrants` record. A changed email, unverified token, inactive grant or missing `mail` permission denies mail. Dashboard permission alone does not permit mail. No grants are created by deployment or inferred from client flags.

`createAdminAccess().resolveAccess()` is shared by the admin API and mail runtime. `ownerAccess` is true only for the immutable owner; `adminAccess` means an authorized administrator; `mailAccess` additionally requires the mail permission. Status reports `adminOnly:true`, `paid:false`, `ownerTrial:false` and no entitlement expiry. Operational `ready` is separate from authorization. An ordinary user's status is a minimal unavailable response without roles, mailbox records or billing data; other mail actions are forbidden.

Every mail operation resolves live access before private mailbox, receipt or quota reads/writes or provider calls. Delegates can select only IDs in their own UID-bound mailbox index. Message IDs, pagination cursors, credentials, send receipts and quotas remain bound to that tenant and selected mailbox. Administration does not grant another person's inbox access. Revocation blocks new operations without deleting mail, encrypted credentials or uncertain-send identity. A request already accepted by a mail provider cannot be recalled by revocation.

Admin grant management and the backoffice use a server API with explicit permissions, rather than expanding Firestore client grants. `reports_manage` and `apps_manage` are separate optional permissions; access to the backoffice alone does not grant either. Keep the existing private-app owner policy until the owner explicitly chooses a different app setting.

## Configuration

Use the existing Firebase project `gen-lang-client-0141234491` and named database `ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb`. Do not substitute `(default)`. The dedicated server identity has the approved seven-permission role. Mail/admin collections remain denied to ordinary client SDKs by the existing catchall rules. This feature does not require wider client rules or IAM permissions.

Configure these names through production-only hosting settings, never client JavaScript or build output:

| Variable | Purpose |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64` | Dedicated server identity for the existing project and named database; configure one. |
| `MAIL_PROVIDER` | `hostinger` for this installation. |
| `MAIL_DOMAIN` | Exactly `taithai.app`. |
| `HOSTINGER_API_TOKEN` | Hostinger management API token; server only. |
| `HOSTINGER_MAIL_ORDER_ID` | Exact existing active order for this domain; never an automatic purchase instruction. |
| `MAIL_CREDENTIAL_SECRET` | Persistent base64-encoded 32-byte AES key. Preserve backups; changing it without migration makes saved passwords unreadable. |
| `MAIL_READY` | Explicit operational readiness switch. |
| `OWNER_MAIL_ENABLED` | Historical name for permanent owner/delegated-admin mail; must also be true. |
| `OWNER_MAIL_ORIGIN` | Exact HTTPS `https://taithai-app.netlify.app` origin; no wildcard or arbitrary preview domains. |
| `MEMBERSHIP_SALES_ENABLED` | Keep false. Billing is additionally disabled by code. |

Both mail switches default false. Changing old trial, expiry, quantity or Stripe settings cannot grant access. A temporary mail stop blocks operations and retains browser/server retry records for restoration. An unavailable provider management API disables new creation, while authorized users can still read/send using existing mailbox credentials when the mail switches and IMAP/SMTP remain ready.

Production secrets were stored only in Netlify's encrypted production settings, not branch deploys, previews or agent runners. On the observed Free Legacy account those secrets necessarily apply to production build/functions/runtime scopes; static publication explicitly excludes server code and secret files. Do not print, commit or export their values.

## Real capacity and safe creation

The owner confirmed payment for Hostinger Starter Business Email at the observed THB 63.13/month including tax. Read-only adapter checks passed all five GET requests: the exact `taithai.app` order is active, one provider seat is purchased, zero used and one available. This is an observed current inventory, not a renewal quote or an unlimited quota. No additional purchase is authorized. Reach marketing is separate from mailbox hosting.

Creation uses Hostinger's real inventory and a global provisioning lock across administrators. Immediately before a provider POST, a durable `siteMailProvisioningLedger/hostinger` hold reserves the seat. An uncertain provider response retains that hold without a guessed expiry, even after the admin is revoked. Matching recovery looks up the address and proves the persisted encrypted password before checking free stock, so the last committed seat can recover without a second POST. Only a proven active mailbox releases its hold. Stale or corrupt state fails closed for new creation; existing inboxes are not deleted, adopted, reset or recycled.

A provider-managed mailbox consumes real purchased capacity. The system never buys seats, resets another mailbox's password, adopts an existing foreign address or deletes a mailbox on access revocation. Saved names remain reserved, including `official`; no exceptional name bypass was added. Hostinger new addresses currently use the shared documented subset without `_` or `-`.

Mail passwords are random and AES-256-GCM encrypted with tenant/address/provider authentication data. They are never returned to the browser. SMTP From is fixed to the selected mailbox. The current application allows five recipients and 20 outgoing messages/day/mailbox, plain-text composition and attachment metadata in read messages. HTML messages are converted to inert text with verification URLs retained; scripts, remote images and tracking pixels do not execute. These application limits remain separate from the provider's storage and delivery restrictions.

Sending uses an immutable, fingerprint-bound request ID. A lost SMTP acknowledgement remains uncertain and is never resent automatically. Replaying a receipt cannot select another tenant or mailbox. A missing Sent copy is reported without resending already accepted mail. Keep pending request identity across sign-out, app updates and temporary service stops.

## Deployment and observed readiness

Netlify project `taithai-app` uses the signed-in Free Legacy plan; no card or paid upgrade was selected. Its allowances differ from the new 300-credit Free plan: inspect this team's Billing page rather than assuming unlimited service. Existing applications remain on their current host. The production site needs only a thin private mail entry and redirect to Netlify; no full web-host migration, existing-app secret transfer or website DNS switch is part of this scope.

Authoritative and public DNS verification passed for the six owner-approved mail records, hPanel shows all mail DNS checks green, and Reach DKIM/DMARC were preserved. The new Hostinger token and exact active order ID, Firebase service identity and mail encryption secret are stored in Netlify production settings. Read-only owner Auth lookup and named-database visibility reads passed. The exact `taithai-app.netlify.app` host is authorized in Firebase Authentication.

The source functions are never overwritten by builds. The build prebundles the two mail/membership functions plus the admin API into the generated functions directory, preserving Firebase Admin 14.5.1 and bundling its ESM-only dependency chain. The release check packages actual Netlify NFT artifacts and executes them under Node 22 with `--no-experimental-require-module --no-experimental-detect-module`. Other handlers, direct-function bypass denials, the private-app edge gate and static exclusions remain covered. Cloud checks are still required after publishing the new build; a local package test is not cloud delivery evidence.

No mailbox has been created and no mail has been sent by agents. The owner explicitly wants to register through the site. After deploying, the owner should sign in, create an address and personally verify external receipt (including OTP/link messages), outbound delivery, Sent status and delegated-user isolation. Do not report successful end-to-end delivery before those actions are observed. Enabling private access must not reactivate payments or grant admins automatically.

Historical provider cost comparisons are retained in [membership-cost-options.md](membership-cost-options.md). Earlier public paid-member hosting/Stripe/resale investigations are outside the current task; they do not authorize an account, purchase, public sale or a future activation.
