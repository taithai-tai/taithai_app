import { fetchJson, queryValue, sendJson } from './_shared.js';

function clean(item){
  return {provider:'LRCLIB',trackName:String(item?.trackName||''),artistName:String(item?.artistName||''),plainLyrics:typeof item?.plainLyrics==='string'?item.plainLyrics:null,syncedLyrics:typeof item?.syncedLyrics==='string'?item.syncedLyrics:null};
}

export default async function handler(req,res){
  if(req.method!=='GET')return sendJson(res,405,{error:'Method not allowed'},'no-store');
  const title=queryValue(req.query?.title);
  const artist=queryValue(req.query?.artist);
  const query=queryValue(req.query?.q,100)||(title?`${title} ${artist}`.trim():'');
  if(query.length<2)return sendJson(res,200,title?{result:null}:{results:[]},'no-store');
  try{
    const data=await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query.slice(0,100))}`);
    const results=(Array.isArray(data)?data:[]).slice(0,12).map(clean);
    if(title){
      const exact=results.find(item=>item.trackName.toLocaleLowerCase()===title.toLocaleLowerCase()&&(!artist||item.artistName.toLocaleLowerCase()===artist.toLocaleLowerCase()));
      return sendJson(res,200,{result:exact||results[0]||null});
    }
    return sendJson(res,200,{results});
  }catch{return sendJson(res,502,title?{error:'Lyrics are temporarily unavailable',result:null}:{error:'Lyrics are temporarily unavailable',results:[]},'no-store')}
}
