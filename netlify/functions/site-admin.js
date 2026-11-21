import endpoint from '../../api/site-admin.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/site-admin','/api/site-admin/']};
export default createWebFunction(request=>endpoint.fetch(request),{paths:config.path});
