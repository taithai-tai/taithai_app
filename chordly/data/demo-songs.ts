import type { Song } from '@/lib/types';

export const demoSongs: Song[] = [
  {
    id: 'demo-1', slug: 'lom-nao-klang-dao', title: 'ลมหนาวกลางดาว', artist: 'Moonlight Club',
    album: 'คืนที่อบอุ่น', artwork: 'linear-gradient(145deg,#fb7185,#7c3aed)', originalKey: 'C', bpm: 82,
    capo: 0, difficulty: 'ง่าย', views: 12840, createdAt: '2026-08-25', tags: ['popular','trending','thai'],
    content: `{title: ลมหนาวกลางดาว}\n{artist: Moonlight Club}\n{key: C}\n{capo: 0}\n\n{start_of_intro}\n[C] [G] [Am] [F]\n{end_of_intro}\n\n{start_of_verse: Verse 1}\n[C]คืนนี้ลมพาเรื่องราว [G]ลอยไปไกล\n[Am]แสงดาวยังคงทอประกาย [F]เหนือเรา\n[C]ทุกท่วงทำนองที่ร้อง [G]เบาเบา\n[Am]พาใจให้เดินทาง [F]กลับบ้าน\n{end_of_verse}\n\n{start_of_chorus}\n[F]จับคอร์ดเดิมไว้ [G]แล้วร้องไปด้วยกัน\n[Em]ให้คืนนี้ยาวนาน [Am]กว่าทุกวัน\n[F]แม้ทางข้างหน้าจะ [G]ไกลเท่าไร\n[C]เสียงเพลงจะพาเราไป\n{end_of_chorus}\n\n{start_of_outro}\n[C] [G] [Am] [F] [C]\n{end_of_outro}`
  },
  {
    id: 'demo-2', slug: 'morning-window', title: 'Morning Window', artist: 'Northbound',
    album: 'Small Hours', artwork: 'linear-gradient(145deg,#fbbf24,#f97316)', originalKey: 'G', bpm: 96,
    capo: 0, difficulty: 'ง่าย', views: 9340, createdAt: '2026-08-24', tags: ['popular','english'],
    content: `{title: Morning Window}\n{artist: Northbound}\n{key: G}\n\n{start_of_verse}\n[G]Open up the window [D]let the morning in\n[Em]Every quiet moment [C]is a place to begin\n[G]Take another breath now [D]listen to the street\n[Em]Find a little rhythm [C]underneath your feet\n{end_of_verse}\n\n{start_of_chorus}\n[C]We can start again [D]where the daylight grows\n[Bm]Follow every small sound [Em]anywhere it goes\n[C]Keep the simple melody [D]close and sing it slow\n[G]This is all we need to know\n{end_of_chorus}`
  },
  {
    id: 'demo-3', slug: 'rot-fai-khab-sut-thai', title: 'รถไฟขบวนสุดท้าย', artist: 'Sunday Sketch',
    album: 'ชานชาลา', artwork: 'linear-gradient(145deg,#14b8a6,#0f766e)', originalKey: 'F#', bpm: 74,
    capo: 2, difficulty: 'ปานกลาง', views: 7621, createdAt: '2026-08-27', tags: ['trending','latest','thai'],
    content: `{title: รถไฟขบวนสุดท้าย}\n{artist: Sunday Sketch}\n{key: F#}\n{capo: 2}\n\n{start_of_verse}\n[F#]นาฬิกาบอกเวลา [C#]ใกล้เที่ยงคืน\n[D#m]ชานชาลายังมีคน [B]ยืนรอ\n[F#]เก็บเรื่องราวลงกระเป๋า [C#]อย่างเพียงพอ\n[D#m]แล้วออกเดินทาง [B]ไปกับแสงไฟ\n{end_of_verse}\n\n{start_of_chorus}\n[B]รถไฟขบวนสุดท้าย [C#]กำลังเคลื่อนไป\n[A#m]ทิ้งเมืองเดิมไว้ [D#m]ไกลลับตา\n[B]พรุ่งนี้จะพบอะไร [C#]ยังไม่รู้เลย\n[F#]แต่คืนนี้หัวใจพร้อมเดินทาง\n{end_of_chorus}`
  },
  {
    id: 'demo-4', slug: 'paper-planes', title: 'Paper Planes', artist: 'Mellow June', album: 'Daydreams',
    artwork: 'linear-gradient(145deg,#60a5fa,#312e81)', originalKey: 'D', bpm: 108, capo: 0,
    difficulty: 'ปานกลาง', views: 6430, createdAt: '2026-08-23', tags: ['popular','english'],
    content: `{title: Paper Planes}\n{artist: Mellow June}\n{key: D}\n\n{start_of_intro}\n[Dadd9] [A] [Bm7] [Gmaj7]\n{end_of_intro}\n\n{start_of_verse}\n[Dadd9]Fold another paper plane [A]send it through the room\n[Bm7]Let it draw a silver line [Gmaj7]underneath the moon\n[Dadd9]Maybe it will find the place [A]we were dreaming of\n[Bm7]Carry all our quiet words [Gmaj7]somewhere high above\n{end_of_verse}\n\n{start_of_chorus}\n[G]Hold the corners [A]make them strong\n[F#m]Give the little wings [Bm]a song\n[G]Every landing [A]starts a road\n[D]Every heart can travel home\n{end_of_chorus}`
  },
  {
    id: 'demo-5', slug: 'wan-sao-si-fa', title: 'วันเสาร์สีฟ้า', artist: 'Cloud Market', album: 'ตลาดเช้า',
    artwork: 'linear-gradient(145deg,#38bdf8,#6366f1)', originalKey: 'A', bpm: 116, capo: 2,
    difficulty: 'ง่าย', views: 5192, createdAt: '2026-08-28', tags: ['latest','thai'],
    content: `{title: วันเสาร์สีฟ้า}\n{artist: Cloud Market}\n{key: A}\n{capo: 2}\n\n{start_of_verse}\n[A]เช้าวันเสาร์ฟ้าเป็นใจ [E]ลมพัดมา\n[F#m]กาแฟหนึ่งแก้วกับเวลา [D]สบายสบาย\n[A]หยิบกีตาร์ตัวเดิม [E]มาเล่นเพลงง่ายง่าย\n[F#m]ให้ทำนองลอยไป [D]กับก้อนเมฆ\n{end_of_verse}\n\n{start_of_chorus}\n[D]วันนี้ไม่ต้องรีบ [E]ไปที่ไหน\n[C#m]ปล่อยหัวใจให้เดิน [F#m]ช้าลงบ้าง\n[D]คอร์ดไม่กี่คอร์ด [E]ก็สร้างเส้นทาง\n[A]ให้วันธรรมดากลายเป็นเพลง\n{end_of_chorus}`
  }
];

export function getSong(slug: string) { return demoSongs.find(song => song.slug === slug) }
