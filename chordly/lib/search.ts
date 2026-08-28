import { demoSongs } from '@/data/demo-songs';

export function songChords(content: string) {
  return [...content.matchAll(/\[([^\]]+)]/g)].map(match => match[1]);
}

export function searchLocalSongs(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return demoSongs.filter(song => {
    const text = `${song.title} ${song.artist} ${song.album}`.toLocaleLowerCase();
    return text.includes(term) || songChords(song.content).some(chord => chord.toLocaleLowerCase().includes(term));
  });
}

export function searchArtists(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return [...new Set(demoSongs.map(song => song.artist))].filter(artist => artist.toLocaleLowerCase().includes(term));
}
