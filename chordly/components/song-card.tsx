import Link from 'next/link';
import type { Song } from '@/lib/types';
import { FavoriteButton } from './favorite-button';

export function SongCard({song, rank}:{song:Song; rank?:number}) {
  return <Link className="songCard" href={`/song/${song.slug}/`}>
    {rank && <span className="rank">{rank}</span>}
    <div className="artwork small" style={{background:song.artwork}}><span>{song.title.slice(0,1)}</span></div>
    <div className="songCardText"><strong>{song.title}</strong><span>{song.artist}</span></div>
    <span className="keyPill">Key {song.originalKey}</span>
    <span className="views">{Intl.NumberFormat('th-TH',{notation:'compact'}).format(song.views)} ครั้ง</span>
    <FavoriteButton songId={song.id} compact/>
  </Link>;
}
