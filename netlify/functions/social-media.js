import endpoint from '../../api/social-media.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/social-media','/api/social-media/']};
export default createWebFunction(request=>endpoint.fetch(request),{paths:config.path});
