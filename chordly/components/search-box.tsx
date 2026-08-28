'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchArtists, searchLocalSongs } from '@/lib/search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SearchIcon } from './icons';

export function SearchBox({compact=false}:{compact?:boolean}) {
  const [query,setQuery] = useState('');
  const [open,setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounced = useDebouncedValue(query);
  const results = useMemo(() => searchLocalSongs(debounced).slice(0,5),[debounced]);
  const artists = useMemo(() => searchArtists(debounced).slice(0,3),[debounced]);
  function choose(slug:string){ setOpen(false); router.push(`/song/${slug}/`) }
  function searchAll(value=query){ const clean=value.trim(); if(clean){setOpen(false);router.push(`/search/?q=${encodeURIComponent(clean)}`)} }
  return <div className={`searchBox ${compact?'compact':''}`} ref={box}>
    <SearchIcon/>
    <input value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),120)} onKeyDown={e=>{if(e.key==='Enter')searchAll(); if(e.key==='Escape')setOpen(false)}} placeholder="ค้นหาเพลง ศิลปิน หรือคอร์ด..." aria-label="ค้นหาเพลง ศิลปิน หรือคอร์ด" aria-autocomplete="list" aria-expanded={open&&query.length>0}/>
    {query && <button className="clearSearch" onClick={()=>setQuery('')} aria-label="ล้างคำค้นหา">×</button>}
    {open && query && <div className="suggestions" role="listbox">
      {artists.map(artist=><button key={`artist-${artist}`} role="option" onMouseDown={()=>searchAll(artist)}><span className="suggestionArt artistSuggestion">♪</span><span><strong>{artist}</strong><small>ศิลปิน · ดูเพลงทั้งหมด</small></span></button>)}
      {results.map(song=><button key={song.id} role="option" onMouseDown={()=>choose(song.slug)}><span className="suggestionArt" style={{background:song.artwork}}>{song.title.slice(0,1)}</span><span><strong>{song.title}</strong><small>{song.artist} · Key {song.originalKey} · มีคอร์ด</small></span></button>)}
      {!results.length&&!artists.length&&<div className="emptySuggestion"><strong>ค้นต่อจากฐานเพลงออนไลน์ได้</strong><span>กด Enter เพื่อค้นหาด้วยชื่อเพลงหรือศิลปิน</span></div>}
      <button className="allResultsButton" onMouseDown={()=>searchAll()}><span className="suggestionArt searchMore">⌕</span><span><strong>ดูผลค้นหาทั้งหมด</strong><small>รวมเพลงจากฐานข้อมูลออนไลน์</small></span></button>
    </div>}
  </div>;
}
