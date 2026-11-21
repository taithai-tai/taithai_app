import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import { createWebFunction, privateError } from './access.js';

async function bodyBytes(request,maximum) {
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maximum)return null;
  const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks=[];let length=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maximum){await reader.cancel();return null;}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
function queries(url) {
  const result=Object.create(null);
  for(const key of new Set(url.searchParams.keys())){const values=url.searchParams.getAll(key);result[key]=values.length>1?values:values[0];}
  return result;
}
class WebNodeResponse extends Writable {
  constructor(method,onCancel) {
    super();this.statusCode=200;this.statusMessage='';this._headers=new Map();this._sent=false;this._closed=false;this.method=method;
    this.ready=new Promise(resolve=>{this._resolve=resolve;});
    this.stream=new ReadableStream({start:controller=>{this.controller=controller;},cancel:()=>{onCancel();this.destroy();}});
  }
  get headersSent(){return this._sent;}
  setHeader(name,value){if(this._sent)throw Error('HEADERS_ALREADY_SENT');this._headers.set(name.toLowerCase(),value);return this;}
  getHeader(name){return this._headers.get(name.toLowerCase());}
  getHeaders(){return Object.fromEntries(this._headers);}
  hasHeader(name){return this._headers.has(name.toLowerCase());}
  removeHeader(name){if(this._sent)throw Error('HEADERS_ALREADY_SENT');this._headers.delete(name.toLowerCase());}
  status(value){this.statusCode=value;return this;}
  writeHead(code,message,headers){this.statusCode=code;if(typeof message==='string')this.statusMessage=message;else headers=message;
    for(const [name,value]of Object.entries(headers||{}))this.setHeader(name,value);this.flushHeaders();return this;}
  flushHeaders(){if(this._sent)return;this._sent=true;const headers=new Headers();
    for(const [name,value]of this._headers)for(const item of Array.isArray(value)?value:[value])headers.append(name,String(item));
    this._bodyAllowed=this.method!=='HEAD'&&![204,205,304].includes(this.statusCode);
    this._resolve(new Response(this._bodyAllowed?this.stream:null,{status:this.statusCode,...(this.statusMessage?{statusText:this.statusMessage}:{}),headers}));}
  json(value){if(!this.hasHeader('Content-Type'))this.setHeader('Content-Type','application/json; charset=utf-8');return this.end(JSON.stringify(value));}
  send(value){if(value!==null&&typeof value==='object'&&!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))return this.json(value);return this.end(value);}
  _write(chunk,encoding,callback){try{this.flushHeaders();if(this._bodyAllowed)this.controller.enqueue(new Uint8Array(chunk));callback();}catch{callback(Error('RESPONSE_UNAVAILABLE'));}}
  _final(callback){try{this.flushHeaders();this._closed=true;this.controller.close();callback();}catch{callback(Error('RESPONSE_UNAVAILABLE'));}}
  _destroy(error,callback){
    if(!this._sent){this._sent=true;this._resolve(privateError('REQUEST_ABORTED',503));}
    if(!this._closed){this._closed=true;try{this.controller.error(Error('RESPONSE_UNAVAILABLE'));}catch{}}
    callback(error);}
}
export function adaptNodeHandler(handler,{maximum=5*1024*1024}={}) {
  return async (request,context={},meta={params:{}})=>{
    if(request.signal.aborted)return privateError('REQUEST_ABORTED',503);
    const bytes=await bodyBytes(request,maximum);if(bytes===null)return privateError('REQUEST_TOO_LARGE',413);
    const url=new URL(request.url),req=Readable.from(bytes.length?[bytes]:[]);
    Object.assign(req,{method:request.method,url:url.pathname+url.search,headers:Object.fromEntries(request.headers),
      query:{...queries(url),...meta.params},body:request.body===null?undefined:bytes.toString('utf8'),aborted:false,complete:true});
    const cancelled=()=>{req.aborted=true;req.emit('aborted');req.destroy();};
    const res=new WebNodeResponse(request.method,cancelled);
    // A stream can fail after its Response has been handed back. Consume the
    // Writable's error event and report only the sanitized stream failure.
    res.on('error',()=>{});
    const abort=()=>{cancelled();res.destroy();};request.signal.addEventListener('abort',abort,{once:true});
    if(request.signal.aborted){abort();return res.ready;}
    const operation=Promise.resolve().then(()=>handler(req,res)).then(()=>{if(!res.writableEnded&&!res.destroyed)res.end();})
      .catch(()=>{if(!res.headersSent&&!res.destroyed){res.statusCode=503;res.json({error:'SERVICE_UNAVAILABLE'});}else if(!res.destroyed)res.destroy();})
      .finally(()=>request.signal.removeEventListener('abort',abort));
    // Netlify keeps streaming response work alive; waitUntil also supports it in
    // runtimes that expose that API. Nothing is detached from the response body.
    if(typeof context.waitUntil==='function')context.waitUntil(operation);
    return res.ready;
  };
}
export function createNodeFunction(handler,options={}) {
  return createWebFunction(adaptNodeHandler(handler,options),options);
}
