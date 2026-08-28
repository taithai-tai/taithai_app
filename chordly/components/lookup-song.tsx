'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { lyricsService } from '@/services/lyrics/lyrics-service';
import type { LyricsResult } from '@/services/lyrics/types';
import { SearchBox } from './search-box';
import { ChordSheet } from './chord-sheet';
import { buildDraftChordPro, draftKeys } from '@/chord-engine/draft';

export function LookupSong(){
  const params=useSearchParams();const title=(params.get('title')||'').slice(0,180);const artist=(params.get('artist')||'').slice(0,180);
  const [result,setResult]=useState<LyricsResult|null>(null);const [loading,setLoading]=useState(true);const [requested,setRequested]=useState(false);
  const [key,setKey]=useState('C');const [draft,setDraft]=useState('');const [steps,setSteps]=useState(0);
  useEffect(()=>{if(!title){setLoading(false);return}const controller=new AbortController();lyricsService.getLyrics(title,artist,controller.signal).then(setResult).catch(()=>setResult(null)).finally(()=>setLoading(false));return()=>controller.abort()},[title,artist]);
  function requestChord(){const key='chordly:chord-requests';const current=JSON.parse(localStorage.getItem(key)||'[]') as string[];localStorage.setItem(key,JSON.stringify([...new Set([`${title}|${artist}`,...current])].slice(0,100)));setRequested(true)}
  function createDraft(){if(!result?.plainLyrics)return;const content=buildDraftChordPro(result.plainLyrics,title,artist,key);setDraft(content);setSteps(0);localStorage.setItem(`chordly:draft:${title}|${artist}`,content);window.setTimeout(()=>document.getElementById('generatedDraft')?.scrollIntoView({behavior:'smooth'}),50)}
  if(loading)return <main className="lookupPage wrap"><div className="lookupSkeleton"><i/><i/><i/><i/></div></main>;
  return <main className="lookupPage wrap"><section className="lookupHero"><span className="onlineMusic large">♫</span><div><span className="eyebrow">ONLINE SONG</span><h1>{title||'ไม่พบชื่อเพลง'}</h1><p>{artist||'ไม่ทราบชื่อศิลปิน'}</p></div></section><div className="lookupLayout"><article className="plainLyrics"><h2>เนื้อเพลง</h2>{result?.plainLyrics?<pre>{result.plainLyrics}</pre>:<div className="missingState"><strong>ยังไม่มีเนื้อเพลงสำหรับเพลงนี้</strong><span>ลองค้นหาชื่อเพลงหรือศิลปินอีกครั้ง</span><SearchBox compact/></div>}</article><aside className="missingChord"><span className="eyebrow">CHORD STATUS</span><h2>ยังไม่มีคอร์ดที่ตรวจสอบแล้ว</h2><p>สร้างฉบับร่างให้เห็นทันทีได้ แต่เป็นการวาง progression ตัวอย่างจากเนื้อเพลง ไม่ได้ฟังเสียงต้นฉบับ จึงอาจไม่ตรงเพลงจริง</p><label>คีย์สำหรับ Draft<select value={key} onChange={event=>setKey(event.target.value)}>{draftKeys().map(item=><option key={item}>{item}</option>)}</select></label><button onClick={createDraft} disabled={!result?.plainLyrics}>สร้างคอร์ดฉบับร่างทันที</button><button className="secondaryRequest" onClick={requestChord} disabled={requested}>{requested?'บันทึกคำขอในเครื่องแล้ว ✓':'บันทึกคำขอคอร์ดที่ถูกต้อง'}</button><small>Draft จะมีสถานะ Needs Verification และรองรับ Slash Chord เช่น G/B</small></aside></div>{draft&&<section className="generatedDraft" id="generatedDraft"><div className="draftNotice"><div><span>AI-STYLE DRAFT · NEEDS VERIFICATION</span><strong>ฉบับร่างสำหรับทดลองเล่นเท่านั้น</strong><small>คอร์ดนี้สร้างจาก progression ทั่วไป ไม่ได้วิเคราะห์เสียงเพลงต้นฉบับ</small></div><div className="draftTranspose"><button onClick={()=>setSteps(value=>value-1)}>−</button><span>{steps>0?`+${steps}`:steps}</span><button onClick={()=>setSteps(value=>value+1)}>+</button></div></div><ChordSheet content={draft} steps={steps} fontSize={20} instrument="guitar"/></section>}</main>;
}
