import { checkAppAccess } from '../../server-lib/site-app-gate.js';

const PRIVATE_HEADERS = { 'Cache-Control':'private, no-store, max-age=0', 'CDN-Cache-Control':'no-store',
  'Netlify-CDN-Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow, noarchive' };
const CSP="default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com https://*.stripe.com; connect-src 'self' https://*.googleapis.com https://accounts.google.com https://*.firebaseio.com https://*.firebasedatabase.app https://*.stripe.com; frame-src https://accounts.google.com https://*.firebaseapp.com https://*.stripe.com; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests";
const MAIL_CSP=CSP.replace('frame-src https://accounts',"frame-src 'self' https://accounts")
  .replace("img-src 'self' data: https://*.googleusercontent.com", "img-src 'self' data: https:");
export const SOCIAL_CSP="default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://taithai-app.netlify.app https://www.gstatic.com https://*.googleapis.com https://accounts.google.com https://*.firebaseio.com https://*.firebasedatabase.app; frame-src https://accounts.google.com https://*.firebaseapp.com; img-src 'self' blob: data: https://taithai-app.netlify.app https://*.googleusercontent.com; media-src 'self' blob: https://taithai-app.netlify.app; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests";
// Edge must not wait on these Node responses: its response-header limit is40s,
// while Node functions have60s. Each wrapper independently applies the gate and
// security headers before it runs the original handler.
export const NETLIFY_FUNCTION_PATHS=Object.freeze([
  'app-access','membership','membership-webhook','site-admin','social','social-media','healthcare-learning','movie-poster','analyze-movie-ticket','shortlinks',
  'ace','chordly/metadata','chordly/charts','chordly/lyrics',
].flatMap(name=>[`/api/${name}`,`/api/${name}/`]).concat(['/S/:code','/S/:code/']));
export function privateError(code,status=503) {
  return new Response(JSON.stringify({error:code}),{status,headers:{...PRIVATE_HEADERS,'Content-Type':'application/json; charset=utf-8'}});
}
export function platformFunctionPath(pathname) {
  let path=pathname;
  try { for(let i=0;i<4&&path.includes('%');i++)path=decodeURIComponent(path); }
  catch { return true; }
  return /^\/\.netlify\/functions(?:\/|$)/i.test(path);
}
export function applyAccessHeaders(response,accessHeaders={},pathname='') {
  const headers=new Headers(response.headers);
  for(const [key,value]of Object.entries(accessHeaders))headers.set(key,value);
  if (/\bno-store\b/i.test(headers.get('Cache-Control')||''))headers.set('Netlify-CDN-Cache-Control','no-store');
  // Custom static headers aren't guaranteed on an Edge-generated response.
  if (/^\/(?:membership|mail|admin)(?:\/|$)/i.test(pathname)) {
    headers.set('Cache-Control','private, no-store, max-age=0');headers.set('Netlify-CDN-Cache-Control','no-store');
    headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',/^\/mail(?:\/|$)/i.test(pathname)?MAIL_CSP:CSP);
  }
  if (/^\/(?:community|profile|messages)(?:\/|$)/i.test(pathname)) {
    headers.set('Cache-Control','private, no-store, max-age=0');headers.set('Netlify-CDN-Cache-Control','no-store');
    headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',SOCIAL_CSP);
  }
  if (pathname==='/firebase-auth.js') {headers.set('Cache-Control','no-store, max-age=0');headers.set('Netlify-CDN-Cache-Control','no-store');}
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function escapeRegex(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function matchFunctionPath(pathname,paths) {
  for(const path of paths) {
    const names=[];
    const pattern=path.split('/').map(part=>{if(/^:[A-Za-z][A-Za-z0-9_]*$/.test(part)){names.push(part.slice(1));return '([^/]+)';}return escapeRegex(part);}).join('/');
    const match=new RegExp(`^${pattern}$`).exec(pathname);
    if(match) {
      try { return Object.fromEntries(names.map((name,index)=>[name,decodeURIComponent(match[index+1])])); }
      catch { return null; }
    }
  }
  return null;
}
export const isFunctionRequestPath=pathname=>matchFunctionPath(pathname,NETLIFY_FUNCTION_PATHS)!==null;
export function trustedRequest(request,context={}) {
  const headers=new Headers(request.headers),url=new URL(request.url);
  // The browser's Origin and actual request URL are never replaced with a
  // production hostname. Forwarded values cannot spoof the ACE rate bucket.
  headers.set('host',url.host);headers.set('x-forwarded-proto',url.protocol.slice(0,-1));
  headers.delete('cf-connecting-ip');headers.delete('x-forwarded-for');
  if(typeof context.ip==='string' && /^[A-Fa-f0-9:.]{3,80}$/.test(context.ip))headers.set('x-forwarded-for',context.ip);
  return new Request(request,{headers});
}
export function createWebFunction(handler,{paths,checkAccess=checkAppAccess,now=()=>Date.now()}={}) {
  if(!Array.isArray(paths)||!paths.length)throw new TypeError('A canonical function path is required');
  return async (request,context={})=>{
    const startedAt=now(),url=new URL(request.url);
    if(platformFunctionPath(url.pathname))return privateError('NOT_FOUND',404);
    // Run the gate even for encoded/unrecognized routes before deciding whether
    // a handler can execute. This retains its traversal and private API checks.
    let access;
    try {access=await checkAccess(request);}catch{return privateError('APP_SETTINGS_UNAVAILABLE');}
    if(access?.response)return applyAccessHeaders(access.response,{},url.pathname);
    const params=matchFunctionPath(url.pathname,paths);
    if(params===null)return privateError('NOT_FOUND',404);
    try {
      const response=await handler(trustedRequest(request,context),context,{startedAt,params});
      if(!(response instanceof Response))return privateError('SERVICE_UNAVAILABLE');
      return applyAccessHeaders(response,access?.headers,url.pathname);
    } catch {return privateError('SERVICE_UNAVAILABLE');}
  };
}
export const routePaths=path=>[path,`${path}/`];
