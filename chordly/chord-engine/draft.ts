import { transposeChord } from './transpose.ts';

const keys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const progressions = {
  intro: ['C','G/B','Am','F'],
  verse: ['C','G/B','Am','F'],
  prehook: ['Dm','Em','F','G'],
  hook: ['F','G','Em','Am'],
  bridge: ['Am','F','C','G'],
  solo: ['F','G','Em','Am'],
  outro: ['F','G','C','C']
} as const;

export interface DraftOptions {
  syncedLyrics?: string | null;
  bpm?: number;
  beatsPerChord?: number;
}

interface TimedLine { time:number; text:string }
interface TextPart { text:string; isWordLike:boolean }
interface DraftSection { name:string; kind:keyof typeof progressions; lines:TimedLine[] }

export function draftKeys(){ return keys }
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value))}

export function parseSyncedLyrics(syncedLyrics:string):TimedLine[]{
  return syncedLyrics.replace(/\r/g,'').split('\n').flatMap(line=>{
    const match=line.match(/^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)]\s*(.+)$/);
    if(!match)return [];
    return [{time:Number(match[1])*60+Number(match[2]),text:match[3].trim()}];
  }).filter(line=>line.text).slice(0,200);
}

function segmentText(text:string):TextPart[]{
  if(typeof Intl!=='undefined'&&'Segmenter' in Intl){
    return Array.from(new Intl.Segmenter('th',{granularity:'word'}).segment(text),part=>({text:part.segment,isWordLike:Boolean(part.isWordLike)}));
  }
  return text.split(/(\s+)/).filter(Boolean).map(part=>({text:part,isWordLike:/[^\s.,!?…:;\-–—]/u.test(part)}));
}

function sectionHeader(text:string){
  const clean=text.replace(/^\[|]$/g,'').replace(/[:：]\s*$/,'').trim();
  if(/^(intro|อินโทร)(\s*\d+)?$/i.test(clean))return {name:'Intro',kind:'intro' as const};
  if(/^(pre[ -]?(chorus|hook)|พรี[ -]?ฮุก|ก่อนฮุก)(\s*\d+)?$/i.test(clean))return {name:'Pre-Hook',kind:'prehook' as const};
  if(/^(chorus|hook|ฮุก|คอรัส)(\s*\d+)?$/i.test(clean))return {name:'Hook',kind:'hook' as const};
  if(/^(bridge|บริดจ์|ท่อนเชื่อม)(\s*\d+)?$/i.test(clean))return {name:'Bridge',kind:'bridge' as const};
  if(/^(solo|โซโล)(\s*\d+)?$/i.test(clean))return {name:'Solo',kind:'solo' as const};
  if(/^(outro|เอาต์โทร|จบ)(\s*\d+)?$/i.test(clean))return {name:'Outro',kind:'outro' as const};
  if(/^(verse|ท่อน)\s*\d*$/i.test(clean))return {name:clean,kind:'verse' as const};
  return null;
}

function normalized(lines:TimedLine[]){return lines.map(line=>line.text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).join('|')}

function inferSectionNames(groups:TimedLine[][]):DraftSection[]{
  const counts=new Map<string,number>();
  groups.forEach(group=>counts.set(normalized(group),(counts.get(normalized(group))||0)+1));
  let verse=0;
  const firstHook=groups.findIndex(group=>(counts.get(normalized(group))||0)>1);
  return groups.map((lines,index)=>{
    const repeated=(counts.get(normalized(lines))||0)>1;
    if(repeated)return {name:'Hook',kind:'hook',lines};
    if(firstHook>0&&index===firstHook-1)return {name:'Pre-Hook',kind:'prehook',lines};
    if(firstHook>=0&&index>firstHook&&index<groups.length-1&&lines.length<=2)return {name:'Bridge',kind:'bridge',lines};
    verse+=1;return {name:`Verse ${verse}`,kind:'verse',lines};
  });
}

function splitPlainSections(lyrics:string):DraftSection[]{
  const groups:{header:{name:string;kind:keyof typeof progressions}|null;lines:TimedLine[]}[]=[];
  let lines:TimedLine[]=[];
  let header:{name:string;kind:keyof typeof progressions}|null=null;
  for(const raw of lyrics.replace(/\r/g,'').split('\n').slice(0,240)){
    const text=raw.trim();
    const detected=sectionHeader(text);
    if(detected){if(lines.length)groups.push({header,lines});lines=[];header=detected;continue}
    if(!text){if(lines.length){groups.push({header,lines});lines=[];header=null}continue}
    lines.push({time:0,text});
  }
  if(lines.length)groups.push({header,lines});
  if(groups.some(group=>group.header))return groups.map((group,index)=>({name:group.header?.name||`Verse ${index+1}`,kind:group.header?.kind||'verse',lines:group.lines}));
  const balanced=groups.flatMap(group=>group.lines.length>6?Array.from({length:Math.ceil(group.lines.length/4)},(_,index)=>group.lines.slice(index*4,index*4+4)):[group.lines]);
  return inferSectionNames(balanced);
}

function splitTimedSections(lines:TimedLine[]):DraftSection[]{
  const groups:TimedLine[][]=[];
  let current:TimedLine[]=[];
  lines.forEach((line,index)=>{
    if(current.length&&line.time-lines[index-1].time>=12){groups.push(current);current=[]}
    current.push(line);
  });
  if(current.length)groups.push(current);
  const balanced=groups.flatMap(group=>group.length>8?Array.from({length:Math.ceil(group.length/4)},(_,index)=>group.slice(index*4,index*4+4)):[group]);
  return inferSectionNames(balanced);
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
  return {line:parts.map((part,index)=>`${targets.has(index)?`[${targets.get(index)}]`:''}${part.text}`).join(''),nextIndex:startIndex+chordCount};
}

function renderSection(section:DraftSection,key:string,bpm:number,beatsPerChord:number,hasTiming:boolean){
  const steps=Math.max(0,keys.indexOf(key));
  const chords=progressions[section.kind].map(chord=>transposeChord(chord,steps,/b/.test(key)));
  let chordIndex=0;
  const body=section.lines.map((line,index)=>{
    const next=section.lines[index+1];
    const secondsPerChord=60/bpm*beatsPerChord;
    const duration=next&&next.time>line.time?next.time-line.time:secondsPerChord;
    const words=segmentText(line.text).filter(part=>part.isWordLike).length;
    const count=hasTiming?clamp(Math.round(duration/secondsPerChord),1,4):words>=12?3:words>=7?2:1;
    const placed=placeChordsAtWords(line.text,chords,chordIndex,count);chordIndex=placed.nextIndex;return placed.line;
  }).join('\n');
  return `{start_of_${section.kind}: ${section.name}}\n${body}\n{end_of_${section.kind}}`;
}

function instrumental(name:string,kind:keyof typeof progressions,key:string,rows=1){
  const steps=Math.max(0,keys.indexOf(key));
  const chords=progressions[kind].map(chord=>transposeChord(chord,steps,/b/.test(key)));
  const row=chords.map(chord=>`[${chord}]  `).join('').trimEnd();
  return `{start_of_${kind}: ${name}}\n${Array.from({length:rows},()=>row).join('\n')}\n{end_of_${kind}}`;
}

export function buildDraftChordPro(lyrics:string,title:string,artist:string,key='C',options:DraftOptions={}) {
  const timedLines=options.syncedLyrics?parseSyncedLyrics(options.syncedLyrics):[];
  const sections=timedLines.length?splitTimedSections(timedLines):splitPlainSections(lyrics);
  if(!sections.length)return '';
  const bpm=clamp(Math.round(options.bpm||72),40,220);
  const beatsPerChord=clamp(Math.round(options.beatsPerChord||4),1,8);
  const arranged:DraftSection[]=[];
  sections.forEach((section,index)=>{
    arranged.push(section);
    const hookCount=arranged.filter(item=>item.kind==='hook').length;
    if(section.kind==='hook'&&hookCount===2&&index<sections.length-1)arranged.push({name:'Solo',kind:'solo',lines:[{time:0,text:''}]});
  });
  const rendered=[instrumental('Intro','intro',key,2),...arranged.map(section=>section.kind==='solo'&&section.lines.every(line=>!line.text)?instrumental('Solo','solo',key,2):renderSection(section,key,bpm,beatsPerChord,timedLines.length>0)),instrumental('Outro','outro',key)].join('\n\n');
  const timing=timedLines.length?`line timestamps · ${bpm} BPM · ${beatsPerChord} beats/chord`:'word-position estimate';
  return `{title: ${title.slice(0,180)}}\n{artist: ${artist.slice(0,180)}}\n{key: ${key}}\n{capo: 0}\n{comment: generated arrangement — needs verification}\n{comment: timing: ${timing}}\n\n${rendered}`;
}

export function buildChordOnlyDraftPro(title:string,artist:string,key='C'){
  return `{title: ${title.slice(0,180)}}\n{artist: ${artist.slice(0,180)}}\n{key: ${key}}\n{capo: 0}\n{comment: automatic practice chords and arrangement — needs verification}\n\n${instrumental('Intro','intro',key,2)}\n\n${instrumental('Verse','verse',key,4)}\n\n${instrumental('Pre-Hook','prehook',key)}\n\n${instrumental('Hook','hook',key,2)}\n\n${instrumental('Solo','solo',key,2)}\n\n${instrumental('Outro','outro',key)}`;
}
