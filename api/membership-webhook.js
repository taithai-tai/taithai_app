import { createMembershipWebhook } from '../server-lib/site-membership-router.js';
// Stripe's signature is checked against the original request bytes, not JSON re-encoding.
export default { fetch:createMembershipWebhook() };
