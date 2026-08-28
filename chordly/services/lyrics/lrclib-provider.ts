import type { LyricsProvider, LyricsResult } from './types';

const API = '/api/chordly/lyrics';

function mapResult(item: Record<string, unknown>): LyricsResult {
  return {
    provider: 'LRCLIB', trackName: String(item.trackName || ''), artistName: String(item.artistName || ''),
    plainLyrics: typeof item.plainLyrics === 'string' ? item.plainLyrics : null,
    syncedLyrics: typeof item.syncedLyrics === 'string' ? item.syncedLyrics : null
  };
}

export class LrclibProvider implements LyricsProvider {
  async searchLyrics(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) return [];
    const response = await fetch(`${API}?q=${encodeURIComponent(query.slice(0, 100))}`, { signal });
    if (!response.ok) return [];
    const data = await response.json() as {results?:Record<string, unknown>[]};
    return (data.results || []).slice(0, 8).map(mapResult);
  }

  async getLyrics(trackName: string, artistName: string, signal?: AbortSignal) {
    const response=await fetch(`${API}?title=${encodeURIComponent(trackName.slice(0,180))}&artist=${encodeURIComponent(artistName.slice(0,180))}`,{signal});
    if(!response.ok)return null;
    const data=await response.json() as {result?:Record<string,unknown>|null};
    return data.result?mapResult(data.result):null;
  }
}
