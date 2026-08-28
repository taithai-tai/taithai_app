'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { lyricsService } from '@/services/lyrics/lyrics-service';
import type { LyricsResult } from '@/services/lyrics/types';
import { musicMetadataService, type MusicMetadata } from '@/services/metadata/music-metadata-service';
import { SearchBox } from './search-box';
import { ChordSheet } from './chord-sheet';
import { SongArtwork } from './song-artwork';
import { buildChordOnlyDraftPro, buildDraftChordPro, draftKeys } from '@/chord-engine/draft';

function normalize(value:string){return value.trim().toLocaleLowerCase()}

export function LookupSong(){
  const params=useSearchParams();
  const title=(params.get('title')||'').slice(0,180);
  const artist=(params.get('artist')||'').slice(0,180);
  const [result,setResult]=useState<LyricsResult|null>(null);
  const [metadata,setMetadata]=useState<MusicMetadata|null>(null);
  const [loading,setLoading]=useState(true);
  const [key,setKey]=useState('C');
  const [steps,setSteps]=useState(0);
  const [draftMode,setDraftMode]=useState<'full'|'scroll'>('full');
  const [bpm,setBpm]=useState(72);
  const [beatsPerChord,setBeatsPerChord]=useState(4);

  useEffect(()=>{
    if(!title){setLoading(false);return}
    const controller=new AbortController();setLoading(true);
    Promise.allSettled([
      lyricsService.getLyrics(title,artist,controller.signal),
      musicMetadataService.search(`${title} ${artist}`,controller.signal)
    ]).then(([lyrics,items])=>{
      if(lyrics.status==='fulfilled')setResult(lyrics.value);
      if(items.status==='fulfilled'){
        const exact=items.value.find(item=>normalize(item.title)===normalize(title)&&(!artist||normalize(item.artist)===normalize(artist)));
        setMetadata(exact||items.value[0]||null);
      }
    }).finally(()=>setLoading(false));
    return()=>controller.abort();
  },[title,artist]);

  const hasLyrics=Boolean(result?.plainLyrics);
  const hasSyncedTiming=Boolean(result?.syncedLyrics);
  const draft=useMemo(()=>hasLyrics
    ?buildDraftChordPro(result!.plainLyrics!,title,artist,key,{syncedLyrics:result!.syncedLyrics,bpm,beatsPerChord})
    :buildChordOnlyDraftPro(title,artist,key),[hasLyrics,result,title,artist,key,bpm,beatsPerChord]);

  useEffect(()=>{if(!title||!draft)return;localStorage.setItem(`chordly:draft:${title}|${artist}`,draft)},[title,artist,draft]);

  if(loading)return <main className="lookupPage wrap"><div className="lookupHeroSkeleton"><i/><div><i/><i/><i/></div></div><div className="lookupSkeleton"><i/><i/><i/><i/></div></main>;
  if(!title)return <main className="lookupPage wrap"><div className="missingState"><strong>ค้นหาเพลงเพื่อเปิดคอร์ดอัตโนมัติ</strong><span>พิมพ์ชื่อเพลงหรือศิลปินได้เลย</span><SearchBox/></div></main>;

  return <main className="lookupPage autoSongPage">
    <section className="lookupHero wrap">
      <SongArtwork title={title} artist={artist||'Unknown Artist'} artwork={metadata?.artwork} className="lookupPoster"/>
      <div className="lookupHeroText"><span className="eyebrow">AUTO CHORD SHEET</span><h1>{title}</h1><p>{artist||metadata?.artist||'ไม่ทราบชื่อศิลปิน'}</p>{metadata?.album&&<span className="albumName">{metadata.album}</span>}<div className="autoReadyBadge"><span aria-hidden="true">✓</span><strong>มีคอร์ดพร้อมเล่น</strong></div></div>
    </section>

    <section className="autoChordControls" aria-label="ตั้งค่าคอร์ดอัตโนมัติ">
      <div className="autoControlScroll wrap">
        <label>คีย์<select value={key} onChange={event=>{setKey(event.target.value);setSteps(0)}}>{draftKeys().map(item=><option key={item}>{item}</option>)}</select></label>
        <label>BPM<input type="number" inputMode="numeric" min="40" max="220" value={bpm} onChange={event=>setBpm(Math.min(220,Math.max(40,Number(event.target.value)||72)))}/></label>
        <label>จังหวะต่อคอร์ด<select value={beatsPerChord} onChange={event=>setBeatsPerChord(Number(event.target.value))}><option value="2">2 beats</option><option value="4">4 beats</option><option value="8">8 beats</option></select></label>
        <div className="draftTranspose"><button onClick={()=>setSteps(value=>value-1)} aria-label="ลดคีย์หนึ่งครึ่งเสียง">−</button><span>{steps>0?`+${steps}`:steps}</span><button onClick={()=>setSteps(value=>value+1)} aria-label="เพิ่มคีย์หนึ่งครึ่งเสียง">+</button></div>
      </div>
    </section>

    <section className={`autoChordStatus wrap ${hasSyncedTiming?'synced':hasLyrics?'estimated':'chordsOnly'}`} role="status">
      <div><strong>{hasSyncedTiming?'จัดคอร์ดตามเวลาแต่ละบรรทัด':hasLyrics?'จัดคอร์ดเหนือคำร้อง':'โครงเพลงสำหรับทดลองเล่น'}</strong><span>{hasSyncedTiming?`ใช้เวลา Synced Lyrics แบ่งท่อน · ${bpm} BPM · ${beatsPerChord} beats ต่อคอร์ด`:hasLyrics?'แบ่ง Intro, Verse, Pre-Hook, Hook, Solo และ Outro อัตโนมัติ':'ยังไม่พบเนื้อเพลง จึงแสดงโครง Intro ถึง Outro สำหรับฝึกเล่น'}</span></div>
      <small>ฉบับประมาณ · ต้องตรวจเทียบเสียงต้นฉบับก่อนใช้งานจริง</small>
    </section>

    <section className={`generatedDraft autoGeneratedDraft ${draftMode==='full'?'draftFull':'draftScroll'}`}>
      <div className="draftViewBar"><div className="viewModeTabs" role="group" aria-label="รูปแบบการแสดงคอร์ด"><button className={draftMode==='full'?'active':''} aria-pressed={draftMode==='full'} onClick={()=>setDraftMode('full')}>Full</button><button className={draftMode==='scroll'?'active':''} aria-pressed={draftMode==='scroll'} onClick={()=>setDraftMode('scroll')}>Scroll</button></div></div>
      <ChordSheet content={draft} steps={steps} fontSize={20} instrument="guitar" layoutMode={draftMode}/>
    </section>
  </main>;
}
