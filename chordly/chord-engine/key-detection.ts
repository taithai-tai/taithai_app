import { transposeChord } from './transpose.ts';

const majorProfiles: Record<string,string[]> = {
  C:['C','Dm','Em','F','G','Am'], D:['D','Em','F#m','G','A','Bm'], E:['E','F#m','G#m','A','B','C#m'],
  F:['F','Gm','Am','Bb','C','Dm'], G:['G','Am','Bm','C','D','Em'], A:['A','Bm','C#m','D','E','F#m'], B:['B','C#m','D#m','E','F#','G#m']
};

export function detectKey(chords: string[]) {
  if (!chords.length) return { key: 'Unknown', confidence: 0 };
  const clean = chords.map(chord => transposeChord(chord.split('/')[0], 0));
  const scores = Object.entries(majorProfiles).map(([key, profile]) => ({ key, score: clean.filter(chord => profile.includes(chord)).length }));
  scores.sort((a,b) => b.score - a.score);
  return { key: `${scores[0].key} Major`, confidence: Math.round((scores[0].score / clean.length) * 100) };
}
