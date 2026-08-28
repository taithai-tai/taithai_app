'use client';
import { useMemo, useState } from 'react';
import { parseChordPro } from '@/chord-engine/parser';
import { transposeChord } from '@/chord-engine/transpose';
import type { Instrument, ParsedLine } from '@/lib/types';
import { ChordDiagram } from './chord-diagram';

type LayoutMode = 'full'|'scroll';

interface SheetBlock { name?:string; lines:ParsedLine[] }

function makeBlocks(lines:ParsedLine[]) {
  const blocks:SheetBlock[]=[];
  let current:SheetBlock={lines:[]};
  for(const line of lines){
    if(line.type==='section'){
      if(current.lines.length||current.name)blocks.push(current);
      current={name:line.name,lines:[]};
    }else current.lines.push(line);
  }
  if(current.lines.length||current.name)blocks.push(current);
  return blocks;
}

export function ChordSheet({content,steps,fontSize,instrument,layoutMode='scroll'}:{content:string;steps:number;fontSize:number;instrument:Instrument;layoutMode?:LayoutMode}) {
  const lines = useMemo(()=>parseChordPro(content),[content]);
  const blocks = useMemo(()=>makeBlocks(lines),[lines]);
  const [selected,setSelected] = useState<string|null>(null);
  return <>
    <article className={`chordSheet ${layoutMode==='full'?'fullSheet':'scrollSheet'}`} style={{'--lyric-size':`${fontSize}px`} as React.CSSProperties} aria-label="คอร์ดและเนื้อเพลง">
      {blocks.map((block,blockIndex)=>{
        const instrumental=Boolean(block.name&&/intro|instru|solo|outro/i.test(block.name));
        return <section className={`sheetBlock ${instrumental?'instrumentBlock':''}`} key={`${block.name||'lyrics'}-${blockIndex}`}>
          {block.name&&<h2 className="sectionTitle">{block.name}</h2>}
          {block.lines.map((line,index)=>{
        if(line.type==='empty') return <div className="sheetGap" key={index}/>;
        if(line.type==='section') return null;
        return <div className="chordLine" key={index}>{line.tokens.map((token,tokenIndex)=>{
          const chord=token.chord?transposeChord(token.chord,steps):'';
          return <span className="token" key={tokenIndex}>
            <button className={`chord ${chord?'':'blank'}`} onClick={()=>chord&&setSelected(chord)} aria-label={chord?`ดูแผนภาพคอร์ด ${chord}`:undefined} tabIndex={chord?0:-1}>{chord||'\u00a0'}</button>
            <span className="lyric">{token.lyric||'\u00a0'}</span>
          </span>;
        })}</div>;
          })}
        </section>;
      })}
    </article>
    {selected && <div className="diagramOverlay" onClick={()=>setSelected(null)} role="presentation"><div className="diagramSheet" onClick={e=>e.stopPropagation()}><ChordDiagram chord={selected} instrument={instrument} onClose={()=>setSelected(null)}/></div></div>}
  </>;
}
