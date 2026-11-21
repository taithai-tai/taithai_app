import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDevServer} from '../server.js';
import {createAppGate} from '../server-lib/site-app-gate.js';
import {normalizeAppSettings} from '../assets/site-app-catalog.js';
async function app(t,privateChordly=false){
  const settings=normalizeAppSettings(null);if(privateChordly)settings.apps.chordly.visibility='private';
  const server=createDevServer({checkAccess:createAppGate({loadSettings:async()=>settings,verifyOwner:async token=>token==='verified-owner'?{uid:'owner'}:null})});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return (path,options)=>fetch('http://127.0.0.1:'+server.address().port+path,options);
}
test('local Chordly and healthcare routes execute real production handlers for both canonical slash forms without AI calls',async t=>{
  const request=await app(t);
  for(const suffix of ['','/']){
    let result=await request('/api/chordly/metadata'+suffix+'?q=x');assert.equal(result.status,200);assert.deepEqual(await result.json(),{results:[]});
    result=await request('/api/chordly/lyrics'+suffix+'?title=x');assert.equal(result.status,200);assert.deepEqual(await result.json(),{result:null});
    result=await request('/api/chordly/charts'+suffix,{method:'POST'});assert.equal(result.status,405);assert.deepEqual(await result.json(),{error:'Method not allowed'});
    result=await request('/api/healthcare-learning'+suffix);assert.equal(result.status,405);assert.equal(result.headers.get('allow'),'POST');await result.text();
    result=await request('/api/healthcare-learning'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:'not-a-real-case'})});assert.equal(result.status,400);await result.text();
  }
});
test('local API aliases retain the same private app gate and private response caching policy',async t=>{
  const request=await app(t,true);
  for(const route of ['/api/chordly/metadata','/api/chordly/metadata/','/api/chordly/charts','/api/chordly/lyrics/','/api/%63hordly/metadata']){
    const result=await request(route);assert.equal(result.status,403,route);assert.deepEqual(await result.json(),{error:'APP_PRIVATE'});
  }
  const owner=await request('/api/chordly/metadata/?q=x',{headers:{Cookie:'taithai_owner_dev=verified-owner'}});assert.equal(owner.status,200);assert.match(owner.headers.get('cache-control'),/private.*no-store/);assert.deepEqual(await owner.json(),{results:[]});
  const alias=await request('/api/chordly/metadata.js',{headers:{Cookie:'taithai_owner_dev=verified-owner'}});assert.equal(alias.status,404);await alias.text();
});
test('local healthcare rejects invalid or oversized JSON and serves vendored PDF modules with a JavaScript MIME type',async t=>{
  const request=await app(t);
  let result=await request('/api/healthcare-learning/',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});assert.equal(result.status,400);assert.deepEqual(await result.json(),{error:'INVALID_REQUEST'});
  result=await request('/api/healthcare-learning/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:'not-real',prompt:'x'.repeat(3*1024*1024)})});assert.equal(result.status,413);assert.deepEqual(await result.json(),{error:'REQUEST_TOO_LARGE'});
  for(const filename of ['pdf.min.mjs','pdf.worker.min.mjs']){result=await request('/assets/vendor/pdfjs/6.5.438/'+filename);assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);await result.arrayBuffer();}
});
