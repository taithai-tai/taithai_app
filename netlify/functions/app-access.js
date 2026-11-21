import { handleAccessSession } from '../../server-lib/site-app-gate.js';
import { createWebFunction } from '../lib/access.js';
export const config={path:['/api/app-access','/api/app-access/']};
export default createWebFunction(handleAccessSession,{paths:config.path});
