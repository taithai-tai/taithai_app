import endpoint from '../../api/membership.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/membership','/api/membership/']};
export default createWebFunction(request=>endpoint.fetch(request),{paths:config.path});
