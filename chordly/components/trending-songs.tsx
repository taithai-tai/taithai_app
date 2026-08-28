'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { appleMusicChartsService, type TrendingSong } from '@/services/charts/apple-music-charts-service';
import { SongArtwork } from './song-artwork';

const CACHE_KEY='chordly:trending-th';

function readCache(){
  try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null') as {songs:TrendingSong[];savedAt:number}|null}catch{return null}
}

export function TrendingSongs(){
  const [songs,setSongs]=useState<TrendingSong[]>([]);
  const [loading,setLoading]=useState(true);
  const [cached,setCached]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    const cache=readCache();
    if(cache?.songs?.length){setSongs(cache.songs);setCached(true);setLoading(false)}
    appleMusicChartsService.trendingThailand(controller.signal).then(result=>{
      if(!result.songs.length)return;
      setSongs(result.songs);setCached(false);
      localStorage.setItem(CACHE_KEY,JSON.stringify({songs:result.songs,savedAt:Date.now()}));
    }).catch(()=>{}).finally(()=>setLoading(false));
    return()=>controller.abort();
  },[]);

  return <section className="contentSection chartSection" aria-labelledby="trendingTitle">
    <div className="sectionHead"><div><span className="eyebrow">THAILAND TOP CHART</span><h2 id="trendingTitle">เพลงฮิตในไทยตอนนี้</h2></div><span>{cached?'ข้อมูลล่าสุดที่บันทึกไว้':'อัปเดตจาก Apple Music ทุกวัน'}</span></div>
    {loading&&!songs.length?<div className="chartSkeleton" aria-label="กำลังโหลดเพลงฮิต">{Array.from({length:5},(_,index)=><i key={index}/>)}</div>:songs.length?<div className="chartGrid">{songs.slice(0,10).map(song=><Link className="chartCard" key={song.id} href={`/lookup/?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`} aria-label={`อันดับ ${song.rank} ${song.title} โดย ${song.artist}`}><div className="chartArtwork"><SongArtwork title={song.title} artist={song.artist} artwork={song.artwork}/><strong className="chartRank">{song.rank}</strong><span className="chartPlay" aria-hidden="true">›</span></div><strong className="chartTitle">{song.title}</strong><span className="chartArtist">{song.artist}</span>{song.genre&&<small>{song.genre}</small>}</Link>)}</div>:<div className="chartUnavailable"><strong>โหลดเพลงฮิตไม่สำเร็จ</strong><span>ส่วนค้นหาและเพลงคอร์ดพร้อมเล่นยังใช้งานได้ตามปกติ</span></div>}
  </section>;
}
