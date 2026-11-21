# Historical lower-cost mail alternatives

Reviewed 2026-11-21. Payment work is cancelled; current scope is private permanent owner/delegated-admin mail, without a subscription or trial entitlement. The current selected integration is **Hostinger Mail**, with the signed-in Netlify account verified as **Free Legacy**. Its UI shows no saved credit card and no payment information required. The owner declined Purelymail after signup problems. Follow [the current setup guide](membership-setup.md) for activation and verified launch gates. This file retains earlier cost comparisons; it does not select an alternative or authorize a purchase, account, DNS change or deployment.

The current account uses [legacy billing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/billing-for-legacy-plans/), rather than the new Free plan's 300-credit allowance. The published [legacy comparison](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/) lists Free hard limits of 100 GB bandwidth and 300 build minutes/month, plus 125,000 serverless invocations/site/month and one million Edge invocations/month. That page notes older legacy accounts can differ, so use this team's Billing details for its exact allowances. Switching from legacy to credit-based pricing is irreversible; no switch or paid add-on is authorized.

## Earlier low-cost option (not selected)

**Netlify Free + Purelymail Simple: USD 10/year base mail hosting, USD 0/month web hosting within the applicable Free plan's allowances.** This excludes domain renewal, Stripe processing/Billing fees, database usage, applicable taxes and any future hosting upgrade. It is not an unlimited free service.

- For **new credit-based accounts**, [Netlify current pricing](https://www.netlify.com/pricing/) and [credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) list 300 credits/month, a hard limit and no automatic paid recharge on Free. Production deploys, requests, bandwidth and compute share that allowance. Sites pause when credits run out; another project on the same account can affect availability. These figures do not describe the current observed Free Legacy account.
- [Netlify's official Free announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/) describes the new Free offering and permits commercial projects. Use the legacy documentation and account UI for this team's allowances.
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

## Current implementation and verification

Follow [the private administrator mail setup](membership-setup.md) for the current scope, authorization, deployment and remaining real-delivery checks. Billing actions and payment webhooks are disabled by code regardless of keys. No Stripe onboarding, public sale, broad web-host migration or existing-app secret transfer remains in this task.

The selected Hostinger adapter passed all five actual readiness/inventory GETs: one purchased seat, zero used, one available. Its active order and management token are stored only as Netlify production secrets. Approved DNS records passed authoritative/public checks and hPanel is green. The dedicated Firebase identity passed owner/named-database reads and the exact Netlify Firebase Auth domain is authorized. No mailbox has been created or mail sent by agents. Cloud deployment, owner registration and external receive/send verification remain separate from local tests.

Current provider and application limits remain finite. Increases to purchased stock or hosting allowances require a deliberate owner decision; no automatic capacity purchase is implemented. Historical public paid-member provider-consent investigations do not authorize a public email resale service.

## If the owner wants fewer fixed limits

There is no promise of unlimited users, storage, traffic and sending at a fixed cost. Purelymail Simple has soft resource limits and may require Advanced resource-based pricing; its Advanced documentation still notes outbound rate limits. The application's current 20-message/day quota is separately enforced by Taithai and can be changed deliberately after capacity is chosen.

A self-hosted mail system such as Mailcow on a suitable VPS gives the owner control over mailbox counts and quotas. It still has finite disk, memory, network capacity, recipient-side delivery policies and ongoing maintenance/backup costs. [Mailcow requirements](https://docs.mailcow.email/getstarted/prerequisite-system/) currently specify at least 6 GiB RAM plus 1 GiB swap and 20 GiB disk before stored emails, and require appropriate SMTP/IMAP connectivity and DNS. No VPS, Mailcow installation or budget has been selected or purchased.
