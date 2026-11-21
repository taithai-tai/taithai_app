import handler from '../../api/chordly/lyrics.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/chordly/lyrics','/api/chordly/lyrics/']};
export default createNodeFunction(handler,{paths:config.path});
