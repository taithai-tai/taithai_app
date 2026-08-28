import { fetchJson, sendJson } from './_shared.js';

const CURRENT='https://rss.marketingtools.apple.com/api/v2/th/music/most-played/25/songs.json';
const LEGACY='https://itunes.apple.com/th/rss/topsongs/limit=25/json';

function legacyToCurrent(data){
  const entries=data?.feed?.entry||[];
  return {feed:{updated:data?.feed?.updated?.label,results:entries.map(item=>({
    id:item?.id?.attributes?.['im:id'],name:item?.['im:name']?.label,artistName:item?.['im:artist']?.label,
    artworkUrl100:item?.['im:image']?.at(-1)?.label,genres:[{name:item?.category?.attributes?.label}]
  }))}};
}

export default async function handler(req,res){
  if(req.method!=='GET')return sendJson(res,405,{error:'Method not allowed'},'no-store');
  try{return sendJson(res,200,await fetchJson(CURRENT),'public, s-maxage=3600, stale-while-revalidate=86400')}
  catch{
    try{return sendJson(res,200,legacyToCurrent(await fetchJson(LEGACY)),'public, s-maxage=3600, stale-while-revalidate=86400')}
    catch{return sendJson(res,502,{error:'Trending chart is temporarily unavailable'},'no-store')}
  }
}
