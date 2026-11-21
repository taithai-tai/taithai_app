import handler from '../../api/shortlinks.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/shortlinks','/api/shortlinks/','/S/:code','/S/:code/']};
export default createNodeFunction(handler,{paths:config.path,maximum:16384});
