import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Stripe from 'stripe';
import { createAppGate, createAccessSessionHandler } from '../server-lib/site-app-gate.js';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';
import { createNetlifyAppGate } from '../netlify/edge-functions/app-access.js';
import { createWebFunction, NETLIFY_FUNCTION_PATHS } from '../netlify/lib/access.js';
import { createNodeFunction } from '../netlify/lib/node-adapter.js';
import { createACEFunction } from '../netlify/functions/ace.js';
import shortlinks from '../api/shortlinks.js';

const origin='https://trial-example.netlify.app';
function policy(patch={}) {
  const settings=normalizeAppSettings(null);
  for(const [id,visibility]of Object.entries(patch))settings.apps[id].visibility=visibility;
  return createAppGate({loadSettings:async()=>settings,verifyOwner:async token=>token==='owner-session'?{uid:'owner'}:null});
}
function request(path,{owner=false,method='GET',body,headers={}}={}) {
  return new Request(origin+path,{method,headers:{...(owner?{cookie:'__Host-taithai_owner=owner-session'}:{}),...headers},
    ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
function downstream() {let count=0;return {context:{next:async()=>{count++;return new Response('protected content',{headers:{'Cache-Control':'public, max-age=3600','X-Existing':'preserved'}});}},count:()=>count};}

test('Netlify edge gate preserves public/unlisted access and no-store headers before static CDN content',async()=>{
  const gate=createNetlifyAppGate({checkAccess:policy({'qr-reader':'unlisted'})}),next=downstream();
  const publicResponse=await gate(request('/QR%20Code%20Generator%20/'),next.context);
  assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('x-existing'),'preserved');
  assert.match(publicResponse.headers.get('cache-control'),/no-store/);assert.equal(publicResponse.headers.get('netlify-cdn-cache-control'),'no-store');
  const unlisted=await gate(request('/QR%20Code%20Reader/'),next.context);
  assert.equal(unlisted.status,200);assert.match(unlisted.headers.get('x-robots-tag'),/noindex/);assert.equal(next.count(),2);
});
test('nonowners cannot receive private documents, assets, API aliases or encoded app paths',async()=>{
  const checkAccess=policy({'ace':'private','movie-memory':'private'}),gate=createNetlifyAppGate({checkAccess}),next=downstream();
  for(const path of ['/ACE/','/%41CE/','/ACE/assets/site.js','/movie-memory-assets/app.js','/api/ace','/api/%61ce','/Private%20Drive/index.html']){
    const response=await gate(request(path),next.context);assert.ok([303,400,403].includes(response.status),path);
  }
  assert.equal(next.count(),0);
  const approved=await gate(request('/ACE/assets/site.js',{owner:true}),next.context);
  assert.equal(approved.status,200);assert.match(approved.headers.get('cache-control'),/private.*no-store/);
  assert.equal(approved.headers.get('netlify-cdn-cache-control'),'no-store');
});
test('gate failures and ambiguous encoded separators never fall through to protected files',async()=>{
  const broken=createNetlifyAppGate({checkAccess:createAppGate({loadSettings:async()=>{throw Error('database private detail');}})}),next=downstream();
  assert.equal((await broken(request('/ACE/'),next.context)).status,503);assert.equal(next.count(),0);
  const gate=createNetlifyAppGate({checkAccess:policy({'ace':'private'})});
  for(const path of ['/ACE%2fassets/site.js','/ACE/%252e%252e/assets/site.js','/ACE%255cassets/site.js']){
    assert.equal((await gate(request(path),next.context)).status,400,path);
  }
  const failingNext=createNetlifyAppGate({checkAccess:policy()});
  const response=await failingNext(request('/'),{next:async()=>{throw Error('origin private detail');}});
  assert.equal(response.status,503);assert.equal((await response.text()).includes('private detail'),false);
});
test('platform function URLs, encoded platform aliases and unmatched routes never execute API handlers',async()=>{
  let called=0;const handler=createWebFunction(async()=>{called++;return new Response('secret');},{paths:['/api/ace','/api/ace/'],checkAccess:policy({'ace':'private'})});
  for(const path of ['/.netlify/functions/ace','/.netlify/functions/ace/','/%2Enetlify/functions/ace','/%252Enetlify/functions/ace','/api/ace.js']){
    const response=await handler(request(path,{owner:true}));assert.equal(response.status,404,path);
  }
  assert.equal((await handler(request('/api/ace'))).status,403);assert.equal(called,0);
  assert.equal((await handler(request('/api/ace',{owner:true}))).status,200);assert.equal(called,1);
});
test('private function self-gate overrides upstream public cache even when called without Edge middleware',async()=>{
  const handler=createWebFunction(async()=>new Response('binary',{headers:{'Cache-Control':'public, s-maxage=2592000'}}),
    {paths:['/api/movie-poster'],checkAccess:policy({'movie-memory':'private'})});
  assert.equal((await handler(request('/api/movie-poster'))).status,403);
  const response=await handler(request('/api/movie-poster',{owner:true}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
  assert.equal(response.headers.get('netlify-cdn-cache-control'),'no-store');
});
test('authorized API and short-code paths continue without awaiting the Edge40s response deadline',async()=>{
  let called=0;
  const context={next:()=>{called++;return new Promise(()=>{});}};
  const gate=createNetlifyAppGate({checkAccess:policy()});
  for(const path of ['/api/membership/','/api/membership-webhook/','/api/chordly/charts','/api/ace/','/S/g-ABCdef7/']){
    assert.equal(await gate(request(path),context),undefined,path);
  }
  assert.equal(called,0);
  const denied=createNetlifyAppGate({checkAccess:policy({'ace':'private','shortlinks':'private'})});
  assert.equal((await denied(request('/api/ace/'),context)).status,403);
  assert.equal((await denied(request('/S/g-ABCdef7/'),context)).status,303);
  assert.equal(called,0);
});
test('raw Stripe webhook bytes and signature survive Web adapter without JSON parsing or host replacement',async()=>{
  const sdk=new Stripe('test_fixture_only'),secret='webhook_fixture_only';
  const body=' { "id":"evt_netlify", "object":"event", "type":"invoice.paid", "livemode":false, "data":{"object":{"text":"ภาษาไทย"}} }\n';
  const signature=sdk.webhooks.generateTestHeaderString({payload:body,secret});let captured;
  const handler=createWebFunction(async req=>{
    const bytes=Buffer.from(await req.arrayBuffer());captured={bytes,url:req.url,signature:req.headers.get('stripe-signature'),authorization:req.headers.get('authorization')};
    sdk.webhooks.constructEvent(bytes,captured.signature,secret);return Response.json({received:true});
  },{paths:['/api/membership-webhook/'],checkAccess:policy()});
  const response=await handler(request('/api/membership-webhook/',{method:'POST',body,headers:{'stripe-signature':signature,authorization:'Bearer unchanged'}}));
  assert.equal(response.status,200);assert.deepEqual(captured.bytes,Buffer.from(body));assert.equal(captured.url,origin+'/api/membership-webhook/');
  assert.equal(captured.authorization,'Bearer unchanged');assert.equal(captured.signature,signature);
});
test('owner access cookie uses the actual preview origin and cannot be minted by an unverified account',async()=>{
  const access=createAccessSessionHandler({verifyOwner:async token=>token==='verified-owner'?{expiresAt:Date.now()+3600000}:null});
  const handler=createWebFunction(access,{paths:['/api/app-access'],checkAccess:policy()});
  const response=await handler(request('/api/app-access',{method:'POST',headers:{origin,authorization:'Bearer verified-owner'}}));
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/^__Host-taithai_owner=.*HttpOnly.*SameSite=Strict.*Secure/);
  assert.equal((await handler(request('/api/app-access',{method:'POST',headers:{origin:'https://taithai.app',authorization:'Bearer verified-owner'}}))).status,403);
  assert.equal((await handler(request('/api/app-access',{method:'POST',headers:{origin,authorization:'Bearer nonowner'}}))).status,403);
});
test('Node bridge preserves status, JSON, duplicate queries, cookies and real origin while removing spoofed rate IPs',async()=>{
  let captured;
  const handler=createNodeFunction(async(req,res)=>{
    captured={url:req.url,headers:req.headers,query:req.query,body:req.body};
    res.setHeader('Set-Cookie','test=value; Secure');res.status(201).json({saved:true});
  },{paths:['/api/test'],checkAccess:policy()});
  const response=await handler(request('/api/test?q=first&q=second',{method:'POST',body:' { "x": 1 } ',headers:{origin,authorization:'Bearer private',host:'spoof.example','x-forwarded-proto':'http','cf-connecting-ip':'spoof','x-forwarded-for':'spoof'}}),{ip:'203.0.113.5'});
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{saved:true});assert.equal(response.headers.get('set-cookie'),'test=value; Secure');
  assert.deepEqual(captured.query.q,['first','second']);assert.equal(captured.body,' { "x": 1 } ');
  assert.equal(captured.headers.origin,origin);assert.equal(captured.headers.host,'trial-example.netlify.app');assert.equal(captured.headers['x-forwarded-proto'],'https');
  assert.equal(captured.headers.authorization,'Bearer private');assert.equal(captured.headers['x-forwarded-for'],'203.0.113.5');assert.equal(captured.headers['cf-connecting-ip'],undefined);
});
test('Node bridge preserves binary/HEAD and streamed responses without buffering JSON into media',async()=>{
  const binary=createNodeFunction((req,res)=>{res.setHeader('Content-Type','image/png');res.status(206).send(Buffer.from([0,255,1,128]));},
    {paths:['/api/test'],checkAccess:policy()});
  const response=await binary(request('/api/test'));assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from([0,255,1,128]));
  assert.equal((await binary(request('/api/test',{method:'HEAD'}))).body,null);
  const streaming=createNodeFunction(async(req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write('{"part":1}\n');await new Promise(resolve=>setImmediate(resolve));res.end('{"done":true}\n');},
    {paths:['/api/test'],checkAccess:policy()});
  assert.equal(await (await streaming(request('/api/test'))).text(),'{"part":1}\n{"done":true}\n');
});
test('Node bridge enforces body bounds before writes and sanitizes unexpected handler errors',async()=>{
  let called=0;const bounded=createNodeFunction((req,res)=>{called++;res.end('ok');},{paths:['/api/test'],checkAccess:policy(),maximum:8});
  assert.equal((await bounded(request('/api/test',{method:'POST',body:'123456789'}))).status,413);assert.equal(called,0);
  const failing=createNodeFunction(()=>{throw Error('private upstream credential');},{paths:['/api/test'],checkAccess:policy()});
  const response=await failing(request('/api/test'));assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
});
test('Node bridge settles canceled requests before first headers and skips a pre-aborted handler',async()=>{
  const before=new AbortController();before.abort();let called=0;
  const handler=createNodeFunction((req,res)=>{called++;res.end('never');},{paths:['/api/test'],checkAccess:policy()});
  const cancelled=new Request(origin+'/api/test',{signal:before.signal});
  const pre=await handler(cancelled);assert.equal(pre.status,503);assert.equal(called,0);
  const during=new AbortController();let started,release;
  const began=new Promise(resolve=>{started=resolve;}),paused=new Promise(resolve=>{release=resolve;});
  const pending=createNodeFunction(async(req,res)=>{started();await paused;res.end('late');},{paths:['/api/test'],checkAccess:policy()});
  const response=pending(new Request(origin+'/api/test',{signal:during.signal}));
  await began;during.abort();
  const settled=await response;assert.equal(settled.status,503);assert.deepEqual(await settled.json(),{error:'REQUEST_ABORTED'});release();
});
test('short-code custom path preserves redirects and rejects private app bypasses',async()=>{
  const handler=createNodeFunction(shortlinks,{paths:['/api/shortlinks','/S/:code/'],checkAccess:policy()});
  const response=await handler(request('/S/g-ABCdef7/?code=wrong'));assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://is.gd/ABCdef7');
  const blocked=createNodeFunction(shortlinks,{paths:['/S/:code/'],checkAccess:policy({'shortlinks':'private'})});
  assert.notEqual((await blocked(request('/S/g-ABCdef7/'))).status,302);
});
test('ACE keeps model settings and bounds stateless generation within total55s after access checks',async()=>{
  let clock=0,captured;const env={NINEARM_API_KEY:'fixture-only',NINEARM_MODEL:'same-model'};
  const handler=createACEFunction({env,now:()=>clock,checkAccess:async()=>{clock+=10000;return {headers:{}};},handle:async(req,settings,options)=>{
    captured={settings,options,url:req.url};return Response.json({ok:true});
  }});
  assert.equal((await handler(request('/api/ace',{method:'POST',body:'{}'}))).status,200);
  assert.equal(captured.settings,env);assert.equal(captured.options.timeoutMs,45000);assert.equal(captured.url,origin+'/api/ace');
  const exhausted=createACEFunction({now:()=>clock,checkAccess:async()=>{clock+=56000;return {};},handle:async()=>{throw Error('must not start');}});
  assert.equal((await exhausted(request('/api/ace',{method:'POST',body:'{}'}))).status,504);
});
test('every deployed API has canonical custom paths; internal helpers are outside function discovery',async()=>{
  const files=(await readdir(new URL('../netlify/functions/',import.meta.url))).filter(name=>name.endsWith('.js'));
  assert.equal(files.length,11);
  const paths=[];
  for(const file of files){const module=await import(`../netlify/functions/${file}`);assert.equal(typeof module.default,'function');assert.ok(module.config.path.every(path=>path.startsWith('/api/')||path.startsWith('/S/')));paths.push(...module.config.path);}
  assert.deepEqual(paths.sort(),[...NETLIFY_FUNCTION_PATHS].sort());
  const toml=await readFile(new URL('../netlify.toml',import.meta.url),'utf8');
  assert.match(toml,/publish = "public"/);assert.match(toml,/functions = "netlify\/generated-functions"/);
  assert.match(toml,/\[\[edge_functions\]\][\s\S]*?function = "app-access"\s+path = "\/\*"/);
  assert.doesNotMatch(toml,/cache\s*=\s*"manual"/);
  assert.match(toml,/NETLIFY_NEXT_PLUGIN_SKIP = "true"/);
});
