export interface TrendingSong {
  id:string;
  title:string;
  artist:string;
  artwork?:string;
  genre?:string;
  rank:number;
}

interface AppleChartResult {
  id?:string;
  name?:string;
  artistName?:string;
  artworkUrl100?:string;
  genres?:Array<{name?:string}>;
}

interface AppleChartResponse {
  feed?:{updated?:string;results?:AppleChartResult[]};
}

const CHART_URL='/api/chordly/charts';

export function mapAppleChart(data:AppleChartResponse):TrendingSong[]{
  return (data.feed?.results||[]).filter(item=>item.name&&item.artistName).map((item,index)=>({
    id:item.id||`${item.name}-${item.artistName}`,
    title:item.name!,
    artist:item.artistName!,
    artwork:item.artworkUrl100?.replace('100x100bb','600x600bb'),
    genre:item.genres?.[0]?.name,
    rank:index+1
  }));
}

export class AppleMusicChartsService {
  async trendingThailand(signal?:AbortSignal){
    const response=await fetch(CHART_URL,{signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Chart request failed: ${response.status}`);
    const data=await response.json() as AppleChartResponse;
    return {songs:mapAppleChart(data),updated:data.feed?.updated};
  }
}

export const appleMusicChartsService=new AppleMusicChartsService();
