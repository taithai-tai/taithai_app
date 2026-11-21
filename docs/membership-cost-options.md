# Historical lower-cost mail alternatives

Reviewed 2026-11-21. The current selected integration is **Hostinger Mail**, with **Netlify Free** as the prepared web-host route. The owner declined Purelymail after signup problems. Follow [the current setup guide](membership-setup.md) for activation and verified launch gates. This file retains earlier cost comparisons; it does not select an alternative or authorize a purchase, account, DNS change or deployment.

## Earlier low-cost option (not selected)

**Netlify Free + Purelymail Simple: USD 10/year base mail hosting, USD 0/month web hosting within Netlify's free credit allowance.** This excludes domain renewal, Stripe processing/Billing fees, database usage, applicable taxes and any future hosting upgrade. It is not an unlimited free service.

- [Netlify current pricing](https://www.netlify.com/pricing/) and [credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) list 300 credits/month, a hard limit and no automatic paid recharge on Free. Production deploys, requests, bandwidth and compute share that allowance. Sites pause when credits run out; another project on the same account can affect availability.
- [Netlify's official Free announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/) explicitly permits commercial projects. Its old quota figures are superseded by the current credit-based pricing pages.
- [Purelymail pricing](https://purelymail.com/pricing) lists USD 10/year. Mailboxes and custom domains have no per-seat fee. Resource use is subject to soft limits; a larger service may need Advanced pricing rather than continuing at USD 10/year.
- [Purelymail users](https://purelymail.com/docs/users) confirms distinct mailboxes with their own credentials. [Features](https://purelymail.com/docs/features) confirms custom domains, IMAP and TLS SMTP. [Official API](https://news.purelymail.com/api/index.html) and [API settings](https://support.purelymail.com/support/solutions/articles/159000437396-account-settings-security-policies) support automated user provisioning and domain checks.
- [Signup](https://purelymail.com/signup/) currently offers a limited free trial, requiring an SMS-capable phone. Paid signup is a USD 10 initial deposit; automatic top-ups are described with a default USD 11/year cap. The owner must review actual checkout, recurring top-up settings and Terms before paying.

## Other options

| Setup | Published baseline | Tradeoff |
| --- | --- | --- |
| Netlify Free + Migadu Mini | USD 9/month mail + free web within quota | Reuses the existing Migadu adapter; 100 outgoing and 1,000 incoming messages/day and 30 GB are shared across all mailboxes. |
| Netlify Free + Migadu Micro | USD 19/year mail + free web within quota | Only 20 outgoing/day, 200 incoming/day and 5 GB shared; lacks mailbox-limit settings. Not recommended for the currently advertised 20 outgoing/day per member. |
| Vercel Pro + Purelymail Simple | USD 20/month web + USD 10/year mail | Avoids the web-host migration, but retains the largest fixed cost. |

[Migadu pricing](https://www.migadu.com/pricing/), [Vercel Pro](https://vercel.com/docs/plans/pro-plan), [Vercel Hobby noncommercial restriction](https://vercel.com/legal/terms).

## Implementation and verification status

Netlify adapters and Hostinger, Purelymail and Migadu mail adapters are implemented and locally tested. None of those facts establishes a configured production service: actual hosting secrets, provider order/domain activation and real delivery checks are still required. The public membership routes were verified absent from the current Vercel deployment on 2026-11-21.

1. Verify the implemented Netlify Node adapters and response headers in a cloud deployment, including membership webhooks without redirects and the existing private-app access gate. Test protected static routes, encoded paths, rewrites and every existing app before switching DNS. Netlify synchronous Functions have a 60-second ceiling; ACE uses an explicit shorter timeout with a recoverable error rather than silently changing the model or output size. The edge adapter must import Buffer explicitly and must run before cached assets.
2. If switching to the earlier Purelymail alternative, verify the existing adapter against the actual account and published API. Keep strict mailbox ownership, encrypted per-user passwords, safe retry after uncertain provisioning, no adoption or password reset of an existing mailbox, and no automatic deletion/recycling of an address.
3. Disable or account for provider symbolic subaddressing and address normalization before allocating names. Keep users' inboxes isolated and SMTP From fixed to the authenticated mailbox.
4. Check actual domain ownership and all DNS-summary fields, then test external receipt of both OTP and verification-link emails, outbound delivery, Sent-copy and two-user isolation. Use actual provider-issued ownership values.
5. Complete the separate Stripe account's owner-managed business/bank verification. Keep test payments isolated from real mailbox entitlement. Apply restricted production credentials only through the host's secret storage.
6. Verify actual service availability under the chosen free quota. A paused web host also pauses this site's webmail and billing webhook handler; provider mail delivery may continue, but the site cannot guarantee timely access until the host resumes.

The owner selected Hostinger Starter Business Email billed monthly and will confirm payment directly in Hostinger. The reviewed checkout was THB63.13/month including tax for the initial provider seat; the owner has confirmed payment and hPanel now shows the Starter plan attached to taithai.app. The current account shows a Reach100 marketing trial, which does not include an inbox. Before purchase, a provided management token authenticated successfully and the Email orders endpoint returned no orders. After purchase, domain attachment completed in hPanel without creating a mailbox. No token is retained in this repository. The approved mail DNS cutover was verified on both authoritative nameservers and public resolvers on 2026-11-21. No mailbox has been created: the owner explicitly wants to register through Taithai themselves. Web hosting configuration and live sales activation are still pending. Public paid member-email service also needs Hostinger’s written confirmation for that model, as described in the current setup guide.

## If the owner wants fewer fixed limits

There is no promise of unlimited users, storage, traffic and sending at a fixed cost. Purelymail Simple has soft resource limits and may require Advanced resource-based pricing; its Advanced documentation still notes outbound rate limits. The application's current 20-message/day quota is separately enforced by Taithai and can be changed deliberately after capacity is chosen.

A self-hosted mail system such as Mailcow on a suitable VPS gives the owner control over mailbox counts and quotas. It still has finite disk, memory, network capacity, recipient-side delivery policies and ongoing maintenance/backup costs. [Mailcow requirements](https://docs.mailcow.email/getstarted/prerequisite-system/) currently specify at least 6 GiB RAM plus 1 GiB swap and 20 GiB disk before stored emails, and require appropriate SMTP/IMAP connectivity and DNS. No VPS, Mailcow installation or budget has been selected or purchased.
