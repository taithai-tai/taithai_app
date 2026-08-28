export interface LyricsResult {
  provider: string;
  trackName: string;
  artistName: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsProvider {
  searchLyrics(query: string, signal?: AbortSignal): Promise<LyricsResult[]>;
  getLyrics(trackName: string, artistName: string, signal?: AbortSignal): Promise<LyricsResult | null>;
}
