import endpoint from '../../api/social.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/social','/api/social/']};
export default createWebFunction(request=>endpoint.fetch(request),{paths:config.path});
