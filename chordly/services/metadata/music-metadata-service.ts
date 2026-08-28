export interface MusicMetadata {
  id: string; title: string; artist: string; album?: string; release?: string; duration?: number; isrc?: string;
}

export interface MusicMetadataProvider { search(query: string, signal?: AbortSignal): Promise<MusicMetadata[]> }

export class MusicBrainzProvider implements MusicMetadataProvider {
  async search(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) return [];
    const response = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query.slice(0,100))}&fmt=json&limit=8`, {
      signal, headers: { Accept: 'application/json' }
    });
    if (!response.ok) return [];
    const data = await response.json() as { recordings?: Array<Record<string, unknown>> };
    return (data.recordings || []).map(item => ({
      id: String(item.id), title: String(item.title || ''),
      artist: String((item['artist-credit'] as Array<{name?:string}> | undefined)?.[0]?.name || 'Unknown Artist'),
      duration: typeof item.length === 'number' ? item.length : undefined,
      isrc: Array.isArray(item.isrcs) ? String(item.isrcs[0] || '') : undefined
    }));
  }
}

export const musicMetadataService = new MusicBrainzProvider();
