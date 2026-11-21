import { createMembershipWebhook } from '../server-lib/site-membership-router.js';
// Payment work is cancelled; the webhook fails closed without loading Stripe.
export default { fetch:createMembershipWebhook() };
