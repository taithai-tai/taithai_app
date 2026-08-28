'use client';
import { useEffect, useState } from 'react';
import { demoSongs } from '@/data/demo-songs';
import { userLibrary } from '@/services/user-library';
import { SongCard } from './song-card';

export function RecentSongs(){
  const [ids,setIds]=useState<string[]>([]);
  useEffect(()=>{const refresh=()=>setIds(userLibrary.history());refresh();window.addEventListener('chordly:library',refresh);return()=>window.removeEventListener('chordly:library',refresh)},[]);
  const songs=ids.map(id=>demoSongs.find(song=>song.id===id)).filter((song):song is NonNullable<typeof song>=>Boolean(song));
  if(!songs.length)return <section className="recentsInfo"><div><span className="eyebrow">RECENTLY PLAYED</span><h2>ประวัติเพลงของคุณจะอยู่ตรงนี้</h2><p>เมื่อเปิดเพลง Chordly จะจำเพลงล่าสุดไว้บนอุปกรณ์นี้ เพื่อให้กลับมาเล่นต่อได้เร็ว</p></div><span className="privacyBadge">เก็บในเครื่อง · เป็นส่วนตัว</span></section>;
  return <section className="contentSection"><div className="sectionHead"><div><span className="eyebrow">RECENTLY PLAYED</span><h2>เพลงที่ดูล่าสุด</h2></div><span className="privacyBadge">เก็บในเครื่อง · เป็นส่วนตัว</span></div><div className="songList">{songs.slice(0,5).map(song=><SongCard key={song.id} song={song}/>)}</div></section>;
}
