import { createMembershipHandler } from '../server-lib/site-membership-router.js';
// A Web handler preserves streamed request limits and avoids body-parser ambiguity.
export default { fetch:createMembershipHandler() };
