import Link from 'next/link';
import type { Song } from '@/lib/types';
import { FavoriteButton } from './favorite-button';
import { SongArtwork } from './song-artwork';

export function SongCard({song, rank}:{song:Song; rank?:number}) {
  return <Link className="songCard" href={`/song/${song.slug}/`}>
    {rank && <span className="rank">{rank}</span>}
    <SongArtwork title={song.title} artist={song.artist} artwork={song.artwork} className="small"/>
    <div className="songCardText"><strong>{song.title}</strong><span>{song.artist}</span></div>
    <span className="keyPill">Key {song.originalKey}</span>
    <span className="views">{Intl.NumberFormat('th-TH',{notation:'compact'}).format(song.views)} ครั้ง</span>
    <FavoriteButton songId={song.id} compact/>
  </Link>;
}
