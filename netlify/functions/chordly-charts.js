import handler from '../../api/chordly/charts.js';
import { createNodeFunction } from '../lib/node-adapter.js';
export const config={path:['/api/chordly/charts','/api/chordly/charts/']};
export default createNodeFunction(handler,{paths:config.path});
