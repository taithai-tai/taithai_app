'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appleMusicChartsService, type TrendingSong } from '@/services/charts/apple-music-charts-service';
import { demoSongs } from '@/data/demo-songs';
import { SearchBox } from './search-box';
import { MusicRail, type RailSong } from './music-rail';

const CACHE_KEY='chordly:trending-th';

function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null') as {songs:TrendingSong[];savedAt:number}|null}catch{return null}}

export function TrendingSongs(){
  const [songs,setSongs]=useState<TrendingSong[]>([]);
  const [loading,setLoading]=useState(true);
  const [cached,setCached]=useState(false);
  useEffect(()=>{const controller=new AbortController();const cache=readCache();if(cache?.songs?.length){setSongs(cache.songs);setCached(true);setLoading(false)}appleMusicChartsService.trendingThailand(controller.signal).then(result=>{if(!result.songs.length)return;setSongs(result.songs);setCached(false);localStorage.setItem(CACHE_KEY,JSON.stringify({songs:result.songs,savedAt:Date.now()}))}).catch(()=>{}).finally(()=>setLoading(false));return()=>controller.abort()},[]);

  const fallback=demoSongs[0];
  const hero=songs[0];
  const heroTitle=hero?.title||fallback.title;
  const heroArtist=hero?.artist||fallback.artist;
  const heroArtwork=hero?.artwork;
  const heroHref=hero?`/lookup/?title=${encodeURIComponent(hero.title)}&artist=${encodeURIComponent(hero.artist)}`:`/song/${fallback.slug}/`;
  const railSongs=useMemo<RailSong[]>(()=>songs.slice(0,20).map(song=>({id:song.id,title:song.title,artist:song.artist,artwork:song.artwork,rank:song.rank,label:song.genre,href:`/lookup/?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`})),[songs]);

  return <>
    <section className="streamHero" aria-label="เพลงเด่นอันดับหนึ่ง">
      {heroArtwork&&<div className="streamHeroArt" style={{backgroundImage:`url(${JSON.stringify(heroArtwork).slice(1,-1)})`}}/>}
      <div className="streamHeroShade"/>
      <div className="streamHeroContent">
        <span className="streamTopBadge"><b>1</b> อันดับหนึ่งในไทยวันนี้</span>
        <h1>{heroTitle}</h1><p>{heroArtist}</p>
        <div className="streamHeroActions"><Link className="streamPrimary" href={heroHref}><span aria-hidden="true">♪</span> เปิดคอร์ด</Link><a className="streamSecondary" href="#trending"><span aria-hidden="true">ⓘ</span> ดูเพลงฮิต</a></div>
        <div className="streamHeroSearch"><SearchBox/></div>
      </div>
    </section>
    <div className="streamRowsLead"><MusicRail id="trending" title="เพลงฮิตในไทยตอนนี้" subtitle={cached?'ข้อมูลล่าสุดที่บันทึกไว้':'อัปเดตจาก Apple Music ทุกวัน'} songs={railSongs} loading={loading}/>{!loading&&!songs.length&&<div className="streamInlineError">โหลดชาร์ตไม่สำเร็จ — คุณยังค้นหาเพลงและเปิดคอร์ดได้ตามปกติ</div>}</div>
  </>;
}
