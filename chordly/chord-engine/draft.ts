import { transposeChord } from './transpose.ts';

const keys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const progression = ['C','G/B','Am','F'];

export interface DraftOptions {
  syncedLyrics?: string | null;
  bpm?: number;
  beatsPerChord?: number;
}

interface TimedLine { time:number; text:string }
interface TextPart { text:string; isWordLike:boolean }

export function draftKeys(){ return keys }

function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value))}

export function parseSyncedLyrics(syncedLyrics:string):TimedLine[]{
  return syncedLyrics.replace(/\r/g,'').split('\n').flatMap(line=>{
    const match=line.match(/^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)]\s*(.+)$/);
    if(!match)return [];
    return [{time:Number(match[1])*60+Number(match[2]),text:match[3].trim()}];
  }).filter(line=>line.text).slice(0,160);
}

function segmentText(text:string):TextPart[]{
  if(typeof Intl!=='undefined'&&'Segmenter' in Intl){
    return Array.from(new Intl.Segmenter('th',{granularity:'word'}).segment(text),part=>({text:part.segment,isWordLike:Boolean(part.isWordLike)}));
  }
  return text.split(/(\s+)/).filter(Boolean).map(part=>({text:part,isWordLike:/[^\s.,!?…:;\-–—]/u.test(part)}));
}

function placeChordsAtWords(text:string,chords:string[],startIndex:number,count:number){
  const parts=segmentText(text);
  const wordIndexes=parts.map((part,index)=>part.isWordLike?index:-1).filter(index=>index>=0);
  if(!wordIndexes.length)return {line:`[${chords[startIndex%chords.length]}]${text}`,nextIndex:startIndex+1};
  const chordCount=clamp(count,1,Math.min(4,wordIndexes.length));
  const targets=new Map<number,string>();
  for(let index=0;index<chordCount;index++){
    const wordPosition=Math.min(wordIndexes.length-1,Math.floor(index*wordIndexes.length/chordCount));
    targets.set(wordIndexes[wordPosition],chords[(startIndex+index)%chords.length]);
  }
  return {
    line:parts.map((part,index)=>`${targets.has(index)?`[${targets.get(index)}]`:''}${part.text}`).join(''),
    nextIndex:startIndex+chordCount
  };
}

function buildTimedLines(lines:TimedLine[],chords:string[],bpm:number,beatsPerChord:number){
  const secondsPerChord=60/bpm*beatsPerChord;
  let chordIndex=0;
  return lines.map((line,index)=>{
    const nextTime=lines[index+1]?.time;
    const duration=nextTime&&nextTime>line.time?nextTime-line.time:secondsPerChord;
    const chordCount=clamp(Math.round(duration/secondsPerChord),1,4);
    const placed=placeChordsAtWords(line.text,chords,chordIndex,chordCount);
    chordIndex=placed.nextIndex;
    return placed.line;
  });
}

function buildEstimatedLines(lines:string[],chords:string[]){
  let chordIndex=0;
  return lines.map(line=>{
    const wordCount=segmentText(line).filter(part=>part.isWordLike).length;
    const chordCount=wordCount>=12?3:wordCount>=7?2:1;
    const placed=placeChordsAtWords(line,chords,chordIndex,chordCount);
    chordIndex=placed.nextIndex;
    return placed.line;
  });
}

export function buildDraftChordPro(lyrics:string,title:string,artist:string,key='C',options:DraftOptions={}) {
  const steps=Math.max(0,keys.indexOf(key));
  const chords=progression.map(chord=>transposeChord(chord,steps,/b/.test(key)));
  const plainLines=lyrics.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean).slice(0,160);
  const timedLines=options.syncedLyrics?parseSyncedLyrics(options.syncedLyrics):[];
  if(!plainLines.length&&!timedLines.length)return '';
  const bpm=clamp(Math.round(options.bpm||72),40,220);
  const beatsPerChord=clamp(Math.round(options.beatsPerChord||4),1,8);
  const chordLines=timedLines.length
    ?buildTimedLines(timedLines,chords,bpm,beatsPerChord)
    :buildEstimatedLines(plainLines,chords);
  const sections:string[]=[];
  for(let index=0;index<chordLines.length;index+=8){
    const number=Math.floor(index/8)+1;
    sections.push(`{start_of_verse: Draft ${number}}\n${chordLines.slice(index,index+8).join('\n')}\n{end_of_verse}`);
  }
  const timing=timedLines.length?`synced lyrics beat grid · ${bpm} BPM · ${beatsPerChord} beats/chord`:'word-position estimate';
  return `{title: ${title.slice(0,180)}}\n{artist: ${artist.slice(0,180)}}\n{key: ${key}}\n{capo: 0}\n{comment: AI-style draft — needs verification}\n{comment: timing: ${timing}}\n\n${sections.join('\n\n')}`;
}
