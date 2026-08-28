'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { demoSongs } from '@/data/demo-songs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SearchIcon } from './icons';

export function SearchBox({compact=false}:{compact?:boolean}) {
  const [query,setQuery] = useState('');
  const [open,setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounced = useDebouncedValue(query);
  const results = useMemo(() => {
    const normalized = debounced.trim().toLocaleLowerCase();
    if (normalized.length < 1) return [];
    return demoSongs.filter(song => `${song.title} ${song.artist} ${song.album}`.toLocaleLowerCase().includes(normalized)).slice(0,6);
  },[debounced]);
  function choose(slug:string){ setOpen(false); router.push(`/song/${slug}/`) }
  return <div className={`searchBox ${compact?'compact':''}`} ref={box}>
    <SearchIcon/>
    <input value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),120)} onKeyDown={e=>{if(e.key==='Enter'&&results[0])choose(results[0].slug); if(e.key==='Escape')setOpen(false)}} placeholder="ค้นหาเพลงหรือศิลปิน..." aria-label="ค้นหาเพลงหรือศิลปิน" aria-autocomplete="list" aria-expanded={open&&query.length>0}/>
    {query && <button className="clearSearch" onClick={()=>setQuery('')} aria-label="ล้างคำค้นหา">×</button>}
    {open && query && <div className="suggestions" role="listbox">
      {results.length ? results.map(song=><button key={song.id} role="option" onMouseDown={()=>choose(song.slug)}><span className="suggestionArt" style={{background:song.artwork}}>{song.title.slice(0,1)}</span><span><strong>{song.title}</strong><small>{song.artist} · Key {song.originalKey}</small></span></button>) : <div className="emptySuggestion"><strong>ยังไม่พบเพลงนี้</strong><span>ลองค้นหาด้วยชื่อศิลปิน หรือเพิ่มคอร์ดใน Phase 2</span></div>}
    </div>}
  </div>;
}
