'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { lyricsService } from '@/services/lyrics/lyrics-service';
import type { LyricsResult } from '@/services/lyrics/types';
import { SearchBox } from './search-box';

export function LookupSong(){
  const params=useSearchParams();const title=(params.get('title')||'').slice(0,180);const artist=(params.get('artist')||'').slice(0,180);
  const [result,setResult]=useState<LyricsResult|null>(null);const [loading,setLoading]=useState(true);const [requested,setRequested]=useState(false);
  useEffect(()=>{if(!title){setLoading(false);return}const controller=new AbortController();lyricsService.getLyrics(title,artist,controller.signal).then(setResult).catch(()=>setResult(null)).finally(()=>setLoading(false));return()=>controller.abort()},[title,artist]);
  function requestChord(){const key='chordly:chord-requests';const current=JSON.parse(localStorage.getItem(key)||'[]') as string[];localStorage.setItem(key,JSON.stringify([...new Set([`${title}|${artist}`,...current])].slice(0,100)));setRequested(true)}
  if(loading)return <main className="lookupPage wrap"><div className="lookupSkeleton"><i/><i/><i/><i/></div></main>;
  return <main className="lookupPage wrap"><section className="lookupHero"><span className="onlineMusic large">♫</span><div><span className="eyebrow">ONLINE SONG</span><h1>{title||'ไม่พบชื่อเพลง'}</h1><p>{artist||'ไม่ทราบชื่อศิลปิน'}</p></div></section><div className="lookupLayout"><article className="plainLyrics"><h2>เนื้อเพลง</h2>{result?.plainLyrics?<pre>{result.plainLyrics}</pre>:<div className="missingState"><strong>ยังไม่มีเนื้อเพลงสำหรับเพลงนี้</strong><span>ลองค้นหาชื่อเพลงหรือศิลปินอีกครั้ง</span><SearchBox compact/></div>}</article><aside className="missingChord"><span className="eyebrow">CHORD STATUS</span><h2>ยังไม่มีคอร์ดเพลงนี้</h2><p>Chordly พบข้อมูลเพลงแล้ว แต่คอร์ดต้องมาจากฐานข้อมูลของเราเองหรือสมาชิกที่ตรวจสอบแล้ว เพื่อไม่แสดงคอร์ดผิด</p><button onClick={requestChord} disabled={requested}>{requested?'ส่งคำขอแล้ว ✓':'ขอให้เพิ่มคอร์ดเพลงนี้'}</button><small>รองรับ Slash Chord เช่น C/E และ Am/G เมื่อมีเวอร์ชันคอร์ด</small></aside></div></main>;
}
