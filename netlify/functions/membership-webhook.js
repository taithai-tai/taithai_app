import endpoint from '../../api/membership-webhook.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/membership-webhook','/api/membership-webhook/']};
// The original Web request body flows unchanged into Stripe's SDK verifier.
export default createWebFunction(request=>endpoint.fetch(request),{paths:config.path});
