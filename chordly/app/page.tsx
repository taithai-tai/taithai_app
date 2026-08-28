import { demoSongs } from '@/data/demo-songs';
import { TrendingSongs } from '@/components/trending-songs';
import { MusicRail, type RailSong } from '@/components/music-rail';
import { RecentSongs } from '@/components/recent-songs';

function toRailSong(song:typeof demoSongs[number],label?:string):RailSong{return {id:song.id,title:song.title,artist:song.artist,artwork:song.artwork,href:`/song/${song.slug}/`,label}}

export default function HomePage(){
  const popular=[...demoSongs].sort((a,b)=>b.views-a.views).map(song=>toRailSong(song,`Key ${song.originalKey}`));
  const easy=demoSongs.filter(song=>song.difficulty==='ง่าย').map(song=>toRailSong(song,'เล่นง่าย'));
  const latest=[...demoSongs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(song=>toRailSong(song,'คอร์ดใหม่'));
  const thai=demoSongs.filter(song=>song.tags.includes('thai')).map(song=>toRailSong(song,'เพลงไทย'));
  return <main className="netflixHome"><TrendingSongs/><div className="streamRows"><MusicRail id="ready" title="คอร์ดพร้อมเล่น" subtitle="เปิดแล้วเล่นได้ทันที" songs={popular}/><MusicRail title="เพลงเล่นง่าย" songs={easy}/><MusicRail title="เพลงไทย" songs={thai}/><MusicRail title="คอร์ดมาใหม่" songs={latest}/><RecentSongs/></div></main>;
}
