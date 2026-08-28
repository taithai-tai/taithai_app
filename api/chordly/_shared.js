export function queryValue(value,max=180){
  return String(Array.isArray(value)?value[0]:value||'').trim().slice(0,max);
}

export async function fetchJson(url,timeout=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'Chordly/1.0 (https://taithai.app/Chordly/)'}});
    if(!response.ok)throw new Error(`Upstream ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timer)}
}

export function sendJson(res,status,data,cache='public, s-maxage=300, stale-while-revalidate=86400'){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',cache);
  return res.status(status).json(data);
}
