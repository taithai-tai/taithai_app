import handler from '../../api/healthcare-learning.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/healthcare-learning','/api/healthcare-learning/']};
export default createNodeFunction(handler,{paths:config.path,maximum:3*1024*1024});
