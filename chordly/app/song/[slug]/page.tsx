import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { demoSongs, getSong } from '@/data/demo-songs';
import { SongViewer } from '@/components/song-viewer';

export function generateStaticParams(){ return demoSongs.map(song=>({slug:song.slug})) }
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params; const song=getSong(slug); if(!song)return {};
  const title=`${song.title} Chords - ${song.artist}`;
  const description=`คอร์ดเพลง ${song.title} ${song.artist} พร้อมเนื้อเพลง คีย์ คอร์ดกีตาร์ Transpose และ Capo`;
  return {title,description,alternates:{canonical:`/song/${slug}/`},openGraph:{title,description,type:'music.song',url:`/song/${slug}/`}};
}
export default async function SongPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const song=getSong(slug);if(!song)notFound();return <><SongViewer song={song}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'MusicComposition',name:song.title,composer:{'@type':'MusicGroup',name:song.artist},inLanguage:song.tags.includes('thai')?'th':'en'})}}/></>}
