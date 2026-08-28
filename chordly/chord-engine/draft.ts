import { transposeChord } from './transpose.ts';

const keys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const progression = ['C','G/B','Am','F'];

export function draftKeys(){ return keys }

export function buildDraftChordPro(lyrics:string,title:string,artist:string,key='C') {
  const steps=Math.max(0,keys.indexOf(key));
  const chords=progression.map(chord=>transposeChord(chord,steps,/b/.test(key)));
  const lines=lyrics.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean).slice(0,160);
  if(!lines.length)return '';
  const chordLines=lines.map((line,index)=>`[${chords[index%chords.length]}]${line}`);
  const sections:string[]=[];
  for(let index=0;index<chordLines.length;index+=8){
    const number=Math.floor(index/8)+1;
    sections.push(`{start_of_verse: Draft ${number}}\n${chordLines.slice(index,index+8).join('\n')}\n{end_of_verse}`);
  }
  return `{title: ${title.slice(0,180)}}\n{artist: ${artist.slice(0,180)}}\n{key: ${key}}\n{capo: 0}\n{comment: AI-style draft — needs verification}\n\n${sections.join('\n\n')}`;
}
