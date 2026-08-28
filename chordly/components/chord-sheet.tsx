'use client';
import { useMemo, useState } from 'react';
import { parseChordPro } from '@/chord-engine/parser';
import { transposeChord } from '@/chord-engine/transpose';
import type { Instrument } from '@/lib/types';
import { ChordDiagram } from './chord-diagram';

export function ChordSheet({content,steps,fontSize,instrument}:{content:string;steps:number;fontSize:number;instrument:Instrument}) {
  const lines = useMemo(()=>parseChordPro(content),[content]);
  const [selected,setSelected] = useState<string|null>(null);
  return <>
    <article className="chordSheet" style={{'--lyric-size':`${fontSize}px`} as React.CSSProperties} aria-label="คอร์ดและเนื้อเพลง">
      {lines.map((line,index)=>{
        if(line.type==='empty') return <div className="sheetGap" key={index}/>;
        if(line.type==='section') return <h2 className="sectionTitle" key={index}>{line.name}</h2>;
        return <div className="chordLine" key={index}>{line.tokens.map((token,tokenIndex)=>{
          const chord=token.chord?transposeChord(token.chord,steps):'';
          return <span className="token" key={tokenIndex}>
            <button className={`chord ${chord?'':'blank'}`} onClick={()=>chord&&setSelected(chord)} aria-label={chord?`ดูแผนภาพคอร์ด ${chord}`:undefined} tabIndex={chord?0:-1}>{chord||'\u00a0'}</button>
            <span className="lyric">{token.lyric||'\u00a0'}</span>
          </span>;
        })}</div>;
      })}
    </article>
    {selected && <div className="diagramOverlay" onClick={()=>setSelected(null)} role="presentation"><div className="diagramSheet" onClick={e=>e.stopPropagation()}><ChordDiagram chord={selected} instrument={instrument} onClose={()=>setSelected(null)}/></div></div>}
  </>;
}
