import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAppleChart } from '../services/charts/apple-music-charts-service.ts';

test('maps Apple Thailand chart with rank and high resolution artwork',()=>{
  const songs=mapAppleChart({feed:{results:[{id:'1',name:'Hit Song',artistName:'Famous Artist',artworkUrl100:'https://example.com/100x100bb.jpg',genres:[{name:'Pop'}]}]}});
  assert.deepEqual(songs,[{id:'1',title:'Hit Song',artist:'Famous Artist',artwork:'https://example.com/600x600bb.jpg',genre:'Pop',rank:1}]);
});
