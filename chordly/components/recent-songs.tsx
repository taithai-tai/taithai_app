'use client';
import { useEffect, useState } from 'react';
import { demoSongs } from '@/data/demo-songs';
import { userLibrary } from '@/services/user-library';
import { MusicRail, type RailSong } from './music-rail';

export function RecentSongs(){
  const [ids,setIds]=useState<string[]>([]);
  useEffect(()=>{const refresh=()=>setIds(userLibrary.history());refresh();window.addEventListener('chordly:library',refresh);return()=>window.removeEventListener('chordly:library',refresh)},[]);
  const songs=ids.map(id=>demoSongs.find(song=>song.id===id)).filter((song):song is NonNullable<typeof song>=>Boolean(song));
  if(!songs.length)return <section className="streamEmptyHistory"><div><span aria-hidden="true">◷</span><h2>ดูต่อจากเพลงล่าสุด</h2><p>เมื่อคุณเปิดคอร์ดเพลง ประวัติส่วนตัวจะปรากฏตรงนี้</p></div><small>เก็บในอุปกรณ์นี้เท่านั้น</small></section>;
  const railSongs:RailSong[]=songs.slice(0,10).map(song=>({id:song.id,title:song.title,artist:song.artist,artwork:song.artwork,href:`/song/${song.slug}/`,label:'ดูล่าสุด'}));
  return <MusicRail title="ดูต่อจากเพลงล่าสุด" subtitle="เก็บในอุปกรณ์นี้เท่านั้น" songs={railSongs}/>;
}
