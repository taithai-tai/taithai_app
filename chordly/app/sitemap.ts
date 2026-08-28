import type { MetadataRoute } from 'next';
import { demoSongs } from '@/data/demo-songs';
export const dynamic='force-static';
export default function sitemap():MetadataRoute.Sitemap{const base='https://taithai.app/Chordly';return [{url:`${base}/`,lastModified:new Date(),priority:1},...demoSongs.map(song=>({url:`${base}/song/${song.slug}/`,lastModified:new Date(song.createdAt),priority:.8}))]}
