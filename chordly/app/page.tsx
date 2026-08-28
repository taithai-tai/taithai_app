import { SearchBox } from '@/components/search-box';
import { SongCard } from '@/components/song-card';
import { demoSongs } from '@/data/demo-songs';
import { RecentSongs } from '@/components/recent-songs';

export default function HomePage(){
  const trending=demoSongs.filter(s=>s.tags.includes('trending'));
  const latest=[...demoSongs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const artists=[...new Set(demoSongs.map(s=>s.artist))].slice(0,4);
  return <main>
    <section className="homeHero"><div className="heroGlow one"/><div className="heroGlow two"/><div className="heroContent"><span className="eyebrow">PLAY YOUR SONG</span><h1>เพลงที่อยากเล่น<br/><em>อยู่ใกล้แค่หนึ่งค้นหา</em></h1><p>ค้นหาคอร์ด ปรับคีย์ เลือก Capo แล้วเริ่มเล่นได้ทันที</p><SearchBox/><div className="quickSearch"><span>ลองค้นหา</span>{['ลมหนาว','Morning','รถไฟ'].map(q=><span key={q}>{q}</span>)}</div></div></section>
    <div className="homeContent wrap">
      <section className="contentSection"><div className="sectionHead"><div><span className="eyebrow">MOST PLAYED</span><h2>เพลงยอดนิยม</h2></div><span>อัปเดตจากเพลงที่เปิดบ่อย</span></div><div className="songList">{demoSongs.slice().sort((a,b)=>b.views-a.views).slice(0,4).map((song,i)=><SongCard key={song.id} song={song} rank={i+1}/>)}</div></section>
      <section className="splitSections"><div className="contentSection"><div className="sectionHead"><div><span className="eyebrow">TRENDING</span><h2>กำลังมาแรง</h2></div></div><div className="tileGrid">{trending.map(song=><SongCard key={song.id} song={song}/>)}</div></div><div className="contentSection"><div className="sectionHead"><div><span className="eyebrow">NEW CHORDS</span><h2>เพลงล่าสุด</h2></div></div><div className="tileGrid">{latest.slice(0,2).map(song=><SongCard key={song.id} song={song}/>)}</div></div></section>
      <section className="contentSection"><div className="sectionHead"><div><span className="eyebrow">ARTISTS</span><h2>ศิลปินยอดนิยม</h2></div></div><div className="artistGrid">{artists.map((artist,i)=><div className="artistCard" key={artist}><div style={{background:demoSongs[i].artwork}}>{artist.slice(0,1)}</div><strong>{artist}</strong><span>{demoSongs.filter(s=>s.artist===artist).length} เพลง</span></div>)}</div></section>
      <RecentSongs/>
    </div>
  </main>;
}
