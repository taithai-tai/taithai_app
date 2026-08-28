import type { LyricsProvider, LyricsResult } from './types';

const API = 'https://lrclib.net/api';

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
    const response = await fetch(`${API}/search?q=${encodeURIComponent(query.slice(0, 100))}`, { signal });
    if (!response.ok) return [];
    const data = await response.json() as Record<string, unknown>[];
    return data.slice(0, 8).map(mapResult);
  }

  async getLyrics(trackName: string, artistName: string, signal?: AbortSignal) {
    const results = await this.searchLyrics(`${trackName} ${artistName}`, signal);
    return results.find(result => result.trackName.toLocaleLowerCase() === trackName.toLocaleLowerCase()) || results[0] || null;
  }
}
