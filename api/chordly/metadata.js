import { fetchJson, queryValue, sendJson } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='GET')return sendJson(res,405,{error:'Method not allowed'},'no-store');
  const query=queryValue(req.query?.q,100);
  if(query.length<2)return sendJson(res,200,{results:[]},'no-store');
  try{
    const url=`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=TH&media=music&entity=song&limit=15`;
    const data=await fetchJson(url);
    return sendJson(res,200,{results:Array.isArray(data?.results)?data.results:[]});
  }catch{return sendJson(res,502,{error:'Music metadata is temporarily unavailable',results:[]},'no-store')}
}
