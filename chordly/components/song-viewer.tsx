'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Instrument, Song } from '@/lib/types';
import { capoRecommendations, playingKeyForCapo, transposeKey } from '@/chord-engine/transpose';
import { parseChordPro } from '@/chord-engine/parser';
import { detectKey } from '@/chord-engine/key-detection';
import { userLibrary } from '@/services/user-library';
import { ChordSheet } from './chord-sheet';
import { ChordDiagram } from './chord-diagram';
import { FavoriteButton } from './favorite-button';
import { PauseIcon, PlayIcon, ResetIcon, ShareIcon } from './icons';

export function SongViewer({song}:{song:Song}) {
  const [steps,setSteps]=useState(0);
  const [capo,setCapo]=useState(song.capo);
  const [fontSize,setFontSize]=useState(20);
  const [instrument,setInstrument]=useState<Instrument>('guitar');
  const [autoScroll,setAutoScroll]=useState(false);
  const [speed,setSpeed]=useState(2);
  const [toast,setToast]=useState('');
  const frame=useRef<number|null>(null);
  const last=useRef<number>(0);
  const chords=useMemo(()=>parseChordPro(song.content).flatMap(line=>line.type==='line'?line.tokens.map(t=>t.chord).filter(Boolean):[]),[song.content]);
  const estimated=useMemo(()=>detectKey(chords),[chords]);
  const currentKey=transposeKey(song.originalKey,steps);
  const playingKey=playingKeyForCapo(currentKey,capo);
  const suggestions=capoRecommendations(currentKey);

  useEffect(()=>{ userLibrary.remember(song.id) },[song.id]);
  useEffect(()=>{
    if(!autoScroll){ if(frame.current) cancelAnimationFrame(frame.current); last.current=0; return }
    const tick=(time:number)=>{ if(last.current) window.scrollBy(0,((time-last.current)/1000)*(7+speed*7)); last.current=time; if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4){setAutoScroll(false);return} frame.current=requestAnimationFrame(tick) };
    frame.current=requestAnimationFrame(tick);
    return ()=>{if(frame.current)cancelAnimationFrame(frame.current);last.current=0};
  },[autoScroll,speed]);

  async function share(){
    const data={title:`${song.title} Chords`,text:`คอร์ดเพลง ${song.title} — ${song.artist}`,url:location.href};
    try{ if(navigator.share) await navigator.share(data); else {await navigator.clipboard.writeText(location.href);setToast('คัดลอกลิงก์แล้ว')} }catch{}
  }

  return <main className="songPage">
    {toast&&<div className="toast" role="status" onAnimationEnd={()=>setToast('')}>{toast}</div>}
    <section className="songHero wrap">
      <div className="artwork heroArt" style={{background:song.artwork}}><span>{song.title.slice(0,1)}</span></div>
      <div className="songHeroText"><span className="eyebrow">CHORD SHEET</span><h1>{song.title}</h1><span className="artistName">{song.artist}</span>
        <div className="songFacts"><span>Original Key <strong>{song.originalKey}</strong></span><span>Capo <strong>{song.capo}</strong></span>{song.bpm&&<span>BPM <strong>{song.bpm}</strong></span>}<span>{song.difficulty}</span><span>{Intl.NumberFormat('th-TH').format(song.views)} views</span></div>
        <div className="heroActions"><FavoriteButton songId={song.id}/><button className="softButton" onClick={share}><ShareIcon/><span>แชร์</span></button></div>
      </div>
    </section>

    <section className="controlDock" aria-label="เครื่องมือคอร์ด">
      <div className="controlScroll wrap">
        <div className="keyControl"><span>Key <strong>{currentKey}</strong></span><button onClick={()=>setSteps(s=>s-1)} aria-label="ลดคีย์หนึ่งครึ่งเสียง">−</button><span className="transposeValue">{steps>0?`+${steps}`:steps}</span><button onClick={()=>setSteps(s=>s+1)} aria-label="เพิ่มคีย์หนึ่งครึ่งเสียง">+</button><button className="resetButton" disabled={steps===0} onClick={()=>setSteps(0)}><ResetIcon/> Reset</button></div>
        <label className="selectControl">Capo<select value={capo} onChange={e=>setCapo(Number(e.target.value))}>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label>
        <div className="fontControl"><span>ตัวอักษร</span><button onClick={()=>setFontSize(v=>Math.max(16,v-1))}>A−</button><button onClick={()=>setFontSize(v=>Math.min(28,v+1))}>A+</button></div>
        <div className="instrumentTabs" role="group" aria-label="เลือกเครื่องดนตรี">{(['guitar','piano','ukulele'] as Instrument[]).map(item=><button key={item} className={instrument===item?'active':''} aria-pressed={instrument===item} onClick={()=>setInstrument(item)}>{item==='guitar'?'Guitar':item==='piano'?'Piano':'Ukulele'}</button>)}</div>
        <div className="scrollControl"><button className={autoScroll?'active':''} onClick={()=>setAutoScroll(v=>!v)}>{autoScroll?<PauseIcon/>:<PlayIcon/>}<span>{autoScroll?'หยุด':'Auto Scroll'}</span></button><button onClick={()=>setSpeed(v=>Math.max(1,v-1))} aria-label="ลดความเร็ว">−</button><span>{speed}×</span><button onClick={()=>setSpeed(v=>Math.min(5,v+1))} aria-label="เพิ่มความเร็ว">+</button></div>
      </div>
    </section>

    <div className="songLayout wrap">
      <section className="sheetColumn">
        <div className="playingSummary"><div><span>Original Key</span><strong>{song.originalKey}</strong></div><div><span>Playing Key</span><strong>{playingKey}</strong></div><div><span>Capo</span><strong>{capo}</strong></div></div>
        <ChordSheet content={song.content} steps={steps-capo} fontSize={fontSize} instrument={instrument}/>
      </section>
      <aside className="songAside">
        <ChordDiagram chord={transposeKey('C',steps-capo)} instrument={instrument}/>
        <div className="asideCard"><span className="eyebrow">CAPO SUGGESTION</span><h3>เล่นให้ง่ายขึ้น</h3>{suggestions.length?suggestions.map(item=><button key={item.capo} onClick={()=>setCapo(item.capo)}><span>Capo {item.capo}</span><strong>Play {item.playingKey}</strong></button>):<p>คีย์นี้เล่นได้สะดวกโดยไม่ต้องใช้ Capo</p>}</div>
        <div className="asideCard keyEstimate"><span>Key Detection</span><strong>{estimated.key}</strong><small>Confidence {estimated.confidence}%</small></div>
      </aside>
    </div>
  </main>;
}
