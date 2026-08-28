export interface MusicMetadata {
  id: string; title: string; artist: string; album?: string; release?: string; duration?: number; isrc?: string; artwork?: string;
}

export interface MusicMetadataProvider { search(query: string, signal?: AbortSignal): Promise<MusicMetadata[]> }

export class ItunesMetadataProvider implements MusicMetadataProvider {
  async search(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) return [];
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query.slice(0,100))}&country=TH&media=music&entity=song&limit=15`, {signal});
    if (!response.ok) return [];
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map(item => ({
      id: String(item.trackId || ''), title: String(item.trackName || ''), artist: String(item.artistName || 'Unknown Artist'),
      album: typeof item.collectionName==='string'?item.collectionName:undefined,
      release: typeof item.releaseDate==='string'?item.releaseDate:undefined,
      duration: typeof item.trackTimeMillis==='number'?item.trackTimeMillis:undefined,
      artwork: typeof item.artworkUrl100==='string'?item.artworkUrl100.replace('100x100bb','600x600bb'):undefined
    }));
  }
}

export const musicMetadataService = new ItunesMetadataProvider();
