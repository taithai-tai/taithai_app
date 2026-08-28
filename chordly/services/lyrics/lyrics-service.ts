import { LrclibProvider } from './lrclib-provider';
import type { LyricsProvider } from './types';

export class LyricsService {
  constructor(private provider: LyricsProvider = new LrclibProvider()) {}
  searchLyrics(query: string, signal?: AbortSignal) { return this.provider.searchLyrics(query, signal) }
  getLyrics(trackName: string, artistName: string, signal?: AbortSignal) { return this.provider.getLyrics(trackName, artistName, signal) }
}

export const lyricsService = new LyricsService();
