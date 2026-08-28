'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchArtists, searchLocalSongs } from '@/lib/search';
import { lyricsService } from '@/services/lyrics/lyrics-service';
import { musicMetadataService } from '@/services/metadata/music-metadata-service';
import { SongCard } from './song-card';
import { SearchBox } from './search-box';
import { SongArtwork } from './song-artwork';

interface OnlineResult { id:string; title:string; artist:string; source:string; artwork?:string; album?:string }

export function SearchResults(){
  const params=useSearchParams();
  const query=(params.get('q')||'').trim();
  const local=useMemo(()=>searchLocalSongs(query),[query]);
  const artists=useMemo(()=>searchArtists(query),[query]);
  const [online,setOnline]=useState<OnlineResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);

  useEffect(()=>{
    if(query.length<2){setOnline([]);setSearched(true);return}
    const controller=new AbortController(); setLoading(true);setSearched(false);
    Promise.allSettled([lyricsService.searchLyrics(query,controller.signal),musicMetadataService.search(query,controller.signal)]).then(([lyrics,metadata])=>{
      const merged=new Map<string,OnlineResult>();
      if(lyrics.status==='fulfilled') for(const item of lyrics.value){const key=`${item.trackName}|${item.artistName}`.toLocaleLowerCase();merged.set(key,{id:`lr-${item.trackName}-${item.artistName}`,title:item.trackName,artist:item.artistName,source:'LRCLIB'})}
      if(metadata.status==='fulfilled') for(const item of metadata.value){const key=`${item.title}|${item.artist}`.toLocaleLowerCase();const current=merged.get(key);merged.set(key,{...current,id:current?.id||item.id,title:item.title,artist:item.artist,source:current?'LRCLIB + Apple Music':'Apple Music',artwork:item.artwork,album:item.album})}
      setOnline([...merged.values()].filter(item=>{const key=`${item.title}|${item.artist}`.toLocaleLowerCase();return !local.some(song=>`${song.title}|${song.artist}`.toLocaleLowerCase()===key)}).slice(0,15));
    }).finally(()=>{setLoading(false);setSearched(true)});
    return()=>controller.abort();
  },[query,local]);

  return <main className="searchPage wrap">
    <div className="searchPageHead"><span className="eyebrow">SEARCH CHORDLY</span><h1>{query?`ผลค้นหา “${query}”`:'ค้นหาเพลง ศิลปิน หรือคอร์ด'}</h1><SearchBox/></div>
    {artists.length>0&&<section className="searchGroup"><h2>ศิลปิน</h2><div className="artistResults">{artists.map(artist=><Link key={artist} href={`/search/?q=${encodeURIComponent(artist)}`}><span>♪</span><div><strong>{artist}</strong><small>{local.filter(song=>song.artist===artist).length} เพลงที่มีคอร์ด</small></div></Link>)}</div></section>}
    {local.length>0&&<section className="searchGroup"><div className="resultTitle"><h2>เพลงที่มีคอร์ดแล้ว</h2><span>{local.length} เพลง</span></div><div className="songList">{local.map(song=><SongCard key={song.id} song={song}/>)}</div></section>}
    <section className="searchGroup"><div className="resultTitle"><h2>เพลงจากฐานข้อมูลออนไลน์</h2><span>ค้นด้วยชื่อเพลงและศิลปิน</span></div>
      {loading?<div className="resultSkeleton">{[1,2,3,4].map(i=><i key={i}/>)}</div>:online.length?<div className="onlineResults">{online.map(item=><Link key={item.id} href={`/lookup/?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`}><SongArtwork title={item.title} artist={item.artist} artwork={item.artwork} className="onlineCover"/><div><strong>{item.title}</strong><small>{item.artist}{item.album?` · ${item.album}`:''}</small></div><span className="availability">เปิดคอร์ดทันที</span></Link>)}</div>:searched&&query&&<div className="noOnline"><strong>ไม่พบผลลัพธ์เพิ่มเติม</strong><span>ลองใช้ชื่อเพลงภาษาอังกฤษ ชื่อศิลปินเต็ม หรือชื่อคอร์ด เช่น C/E</span></div>}
    </section>
  </main>;
}
