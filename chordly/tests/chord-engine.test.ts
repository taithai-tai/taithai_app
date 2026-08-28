import test from 'node:test';
import assert from 'node:assert/strict';
import { capoRecommendations, playingKeyForCapo, transposeChord } from '../chord-engine/transpose.ts';
import { parseChordPro } from '../chord-engine/parser.ts';
import { detectKey } from '../chord-engine/key-detection.ts';
import { buildChordOnlyDraftPro, buildDraftChordPro, parseSyncedLyrics } from '../chord-engine/draft.ts';

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
test('builds an explicitly marked draft with slash chords',()=>{const draft=buildDraftChordPro('line one\nline two','Song','Artist','C');assert.match(draft,/needs verification/);assert.match(draft,/\[G\/B]line two/)});
test('builds a complete arrangement with intro, pre-hook, hook, solo and outro',()=>{const lyrics='a one\na two\n\nb one\nb two\n\nhook one\nhook two\n\nc one\nc two\n\nhook one\nhook two\n\nlast one';const draft=buildDraftChordPro(lyrics,'Song','Artist','C');assert.match(draft,/start_of_intro: Intro/);assert.match(draft,/start_of_prehook: Pre-Hook/);assert.match(draft,/start_of_hook: Hook/);assert.match(draft,/start_of_solo: Solo/);assert.match(draft,/start_of_outro: Outro/)});
test('keeps explicit section labels from lyrics',()=>{const lyrics='[Verse 1]\nline one\n[Pre-Hook]\nline two\n[Hook]\nline three\n[Solo]\nline four';const draft=buildDraftChordPro(lyrics,'Song','Artist','C');assert.match(draft,/start_of_verse: Verse 1/);assert.match(draft,/start_of_prehook: Pre-Hook/);assert.match(draft,/start_of_hook: Hook/);assert.match(draft,/start_of_solo: Solo/)});
test('parses LRC timestamps into seconds',()=>{assert.deepEqual(parseSyncedLyrics('[00:01.50] first line\n[01:02.25] second line'),[{time:1.5,text:'first line'},{time:62.25,text:'second line'}])});
test('places multiple chords at lyric word positions from synced timing',()=>{const lyrics='one two three four five six\nnext line';const synced='[00:00.00] one two three four five six\n[00:08.00] next line';const draft=buildDraftChordPro(lyrics,'Song','Artist','C',{syncedLyrics:synced,bpm:60,beatsPerChord:4});assert.match(draft,/\[C]one two three \[G\/B]four/);assert.match(draft,/timing: line timestamps · 60 BPM · 4 beats\/chord/)});
test('provides playable chords when lyrics are unavailable',()=>{const draft=buildChordOnlyDraftPro('Song','Artist','D');assert.match(draft,/automatic practice chords/);assert.match(draft,/\[D].*\[A\/C#].*\[Bm].*\[G]/)});
