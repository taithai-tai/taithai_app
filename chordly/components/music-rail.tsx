'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SongArtwork } from './song-artwork';

export interface RailSong {id:string;title:string;artist:string;artwork?:string;href:string;rank?:number;label?:string}

export function MusicRail({title,subtitle,songs,loading=false,id}:{title:string;subtitle?:string;songs:RailSong[];loading?:boolean;id?:string}){
  const rail=useRef<HTMLDivElement>(null);
  const [canBack,setCanBack]=useState(false);
  const [canForward,setCanForward]=useState(true);
  function update(){const node=rail.current;if(!node)return;setCanBack(node.scrollLeft>8);setCanForward(node.scrollLeft+node.clientWidth<node.scrollWidth-8)}
  useEffect(()=>{update();const node=rail.current;if(!node)return;const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect()},[songs.length]);
  function move(direction:-1|1){const node=rail.current;if(!node)return;const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;node.scrollBy({left:direction*node.clientWidth*.78,behavior:reduce?'auto':'smooth'});window.setTimeout(update,reduce?20:350)}
  return <section className="streamRailSection" id={id} aria-labelledby={`${id||title}-title`}>
    <div className="streamRailHead"><div><h2 id={`${id||title}-title`}>{title}</h2>{subtitle&&<span>{subtitle}</span>}</div><div className="railButtons"><button onClick={()=>move(-1)} disabled={!canBack} aria-label={`เลื่อน ${title} ไปทางซ้าย`}>‹</button><button onClick={()=>move(1)} disabled={!canForward} aria-label={`เลื่อน ${title} ไปทางขวา`}>›</button></div></div>
    <div className="streamRail" ref={rail} onScroll={update} role="list">
      {loading&&!songs.length?Array.from({length:6},(_,index)=><div className="streamTileSkeleton" key={index} aria-hidden="true"/>):songs.map(song=><Link className="streamTile" href={song.href} key={song.id} role="listitem" aria-label={`${song.rank?`อันดับ ${song.rank} `:''}${song.title} โดย ${song.artist}`}><div className="streamTileArt"><SongArtwork title={song.title} artist={song.artist} artwork={song.artwork}/>{song.rank&&<strong className="streamRank">{song.rank}</strong>}<span className="streamHoverPlay" aria-hidden="true">▶</span>{song.label&&<small className="streamLabel">{song.label}</small>}</div><strong>{song.title}</strong><span>{song.artist}</span></Link>)}
    </div>
  </section>;
}
