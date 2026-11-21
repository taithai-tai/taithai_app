import handler from '../../api/chordly/metadata.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/chordly/metadata','/api/chordly/metadata/']};
export default createNodeFunction(handler,{paths:config.path});
