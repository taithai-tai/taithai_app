import handler from '../../api/movie-poster.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/movie-poster','/api/movie-poster/']};
export default createNodeFunction(handler,{paths:config.path});
