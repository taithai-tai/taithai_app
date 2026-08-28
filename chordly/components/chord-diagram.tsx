'use client';
import type { Instrument } from '@/lib/types';
import { getChordShape } from '@/chord-engine/shapes';
import { CloseIcon } from './icons';

const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function Fretboard({fingering, strings}:{fingering:string; strings:number}) {
  const chars = fingering.padEnd(strings,'0').slice(0,strings).split('');
  return <div className="fretboard" style={{'--strings':strings} as React.CSSProperties}>
    <div className="stringLabels">{chars.map((char,i)=><span key={i}>{char==='0'?'○':char.toLowerCase()==='x'?'×':'●'}</span>)}</div>
    <div className="strings">{chars.map((char,i)=><i key={i}>{/[1-9]/.test(char)&&<b style={{top:`calc(${Number(char)-.5} * 24%)`}}>{Number(char)}</b>}</i>)}</div>
  </div>;
}

function Piano({notes}:{notes:number[]}) {
  return <div className="piano">{noteNames.map((note,index)=><span key={note} className={`${note.includes('#')?'black':'white'} ${notes.includes(index)?'active':''}`} title={note}/>)}</div>;
}

export function ChordDiagram({chord,instrument,onClose}:{chord:string;instrument:Instrument;onClose?:()=>void}) {
  const shape = getChordShape(chord);
  return <div className="diagramCard">
    <div className="diagramHead"><div><span>{instrument==='guitar'?'Guitar':instrument==='piano'?'Piano':'Ukulele'} Chord</span><strong>{chord}</strong></div>{onClose&&<button className="iconButton" onClick={onClose} aria-label="ปิดแผนภาพคอร์ด"><CloseIcon/></button>}</div>
    {shape ? <>
      {instrument==='piano' ? <Piano notes={shape.piano}/> : <Fretboard fingering={shape[instrument]} strings={instrument==='guitar'?6:4}/>} 
      <div className="shapeCode">{instrument==='piano'?shape.piano.map(n=>noteNames[n]).join(' · '):shape[instrument]}</div>
    </> : <div className="noShape">ยังไม่มี Shape สำหรับ {chord}<small>แสดงชื่อคอร์ดไว้ก่อน และสามารถเพิ่ม Shape ในฐานข้อมูลได้</small></div>}
  </div>;
}
