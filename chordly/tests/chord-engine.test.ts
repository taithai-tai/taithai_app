import test from 'node:test';
import assert from 'node:assert/strict';
import { capoRecommendations, playingKeyForCapo, transposeChord } from '../chord-engine/transpose.ts';
import { parseChordPro } from '../chord-engine/parser.ts';
import { detectKey } from '../chord-engine/key-detection.ts';

test('transposes roots, extensions and slash bass',()=>{
  assert.equal(transposeChord('Cmaj7',2),'Dmaj7');
  assert.equal(transposeChord('Am/G',2),'Bm/A');
  assert.equal(transposeChord('F#m/C#',1),'Gm/D');
  assert.equal(transposeChord('Bbadd9',1),'Badd9');
});
test('handles negative and large steps',()=>{assert.equal(transposeChord('C',-1),'B');assert.equal(transposeChord('G',14),'A')});
test('parses section and aligned chord tokens',()=>{const parsed=parseChordPro('{start_of_verse}\n[C]ฉัน [G]ร้องเพลง\n{end_of_verse}');assert.equal(parsed[0].type,'section');assert.equal(parsed[1].type,'line');if(parsed[1].type==='line')assert.equal(parsed[1].tokens[1].chord,'G')});
test('recommends playable capo keys',()=>{assert.deepEqual(capoRecommendations('F#')[0],{capo:2,playingKey:'E'});assert.equal(playingKeyForCapo('F#',2),'E')});
test('estimates a common major key',()=>{assert.deepEqual(detectKey(['C','G','Am','F']),{key:'C Major',confidence:100})});
