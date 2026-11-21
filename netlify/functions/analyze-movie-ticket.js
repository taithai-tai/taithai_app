import handler from '../../api/analyze-movie-ticket.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/analyze-movie-ticket','/api/analyze-movie-ticket/']};
export default createNodeFunction(handler,{paths:config.path});
