export type Instrument = 'guitar' | 'piano' | 'ukulele';
export type Difficulty = 'ง่าย' | 'ปานกลาง' | 'ยาก';

export interface Song {
  id: string;
  slug: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration?: number;
  isrc?: string;
  originalKey: string;
  bpm?: number;
  capo: number;
  difficulty: Difficulty;
  views: number;
  createdAt: string;
  content: string;
  tags: string[];
}

export interface ChordToken { chord: string; lyric: string }
export interface ChordLine { type: 'line'; tokens: ChordToken[] }
export interface SectionLine { type: 'section'; name: string }
export interface EmptyLine { type: 'empty' }
export type ParsedLine = ChordLine | SectionLine | EmptyLine;

export interface ChordShape {
  chord: string;
  guitar: string;
  ukulele: string;
  piano: number[];
}
