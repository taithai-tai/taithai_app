'use client';
import { useEffect, useMemo, useState } from 'react';

function fallbackGradient(value:string){
  let hash=0;for(const char of value)hash=(hash*31+char.charCodeAt(0))|0;
  const hue=Math.abs(hash)%360;
  return `linear-gradient(145deg,hsl(${hue} 78% 62%),hsl(${(hue+72)%360} 58% 32%))`;
}

export function SongArtwork({title,artist,artwork,className=''}:{title:string;artist:string;artwork?:string;className?:string}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[artwork]);
  const remote=Boolean(artwork&&/^https?:\/\//.test(artwork));
  const background=useMemo(()=>remote?fallbackGradient(`${title}|${artist}`):(artwork||fallbackGradient(`${title}|${artist}`)),[remote,artwork,title,artist]);
  return <div className={`artwork ${className} ${remote&&!failed?'hasArtwork':'posterArtwork'}`} style={{background}}>
    {remote&&!failed&&<img src={artwork} alt={`ปกเพลง ${title} โดย ${artist}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>} 
    {(!remote||failed)&&<div className="posterFallback" aria-label={`โปสเตอร์เพลง ${title} โดย ${artist}`}><span aria-hidden="true">♫</span><strong>{title}</strong><small>{artist}</small></div>}
  </div>;
}
