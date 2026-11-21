import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSocialApi,createSocialOutbox,validateSocialFiles,socialAttachmentPath,publicProfileUrl,safeSocialMediaUrl,uploadSocialFile,removeSocialUpload,fetchSocialVideo} from '../assets/site-social-client.js';
import {initSocialPage,socialErrorText} from '../assets/site-social.js';

const uidA='alice',uidB='bob';
const person=uid=>({uid,emailVerified:true,email:uid+'@private.example',displayName:uid,photoURL:'https://lh3.googleusercontent.com/client-photo',getIdToken:async()=>`token-${uid}`});
const profile=uid=>({uid,handle:uid,displayName:uid.toUpperCase(),bio:'A short bio',photoURL:'',followersCount:0,followingCount:0,postsCount:0,createdAt:'2026-11-21T00:00:00.000Z',updatedAt:'2026-11-21T00:00:00.000Z'});
const me=uid=>({profile:profile(uid),defaults:{displayName:uid,photoURL:'https://lh3.googleusercontent.com/server-photo'},limits:{postText:3000,messageText:4000}});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const digest=value=>createHash('sha256').update(value).digest('hex');
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));};
const memory=()=>{const map=new Map();return {get length(){return map.size;},key:index=>[...map.keys()][index]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};};
class Events {
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  async fire(type,extra={}){const event={type,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of [...this.listeners.get(type)||[]])await fn(event);}
}
class Element extends Events {
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this._text='';this.disabled=false;this.hidden=false;this.value='';this.scrollTop=0;this.scrollHeight=500;this.clientHeight=400;this.className='';this.classList={add:()=>{}};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+' '+this.children.map(child=>child.textContent||'').join(' ');}
  set innerHTML(_){throw Error('Unsafe HTML assignment');}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}
  get lastElementChild(){return this.children.at(-1);}get nextElementSibling(){const items=this.parentElement?.children||[];return items[items.indexOf(this)+1];}
  contains(node){return this===node||this.children.some(child=>child.contains?.(node));}
  focus(){this.doc.activeElement=this;}select(){this.selectionStart=0;this.selectionEnd=this.value.length;}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  click(){void this.fire('click');}showModal(){this.open=true;}close(){this.open=false;void this.fire('close');}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);}
}
function fixture({page='community',uid=uidA,target='',call,store=memory(),uploadFile,removeUpload}={}){
  const doc=new Events();doc.createElement=tag=>new Element(tag,doc);doc.body=doc.createElement('body');doc.body.dataset.socialPage=page;doc.documentElement={lang:'en'};doc.visibilityState='visible';const root=doc.createElement('div');root.id='socialRoot';doc.body.append(root);
  const find=(predicate,node=doc.body)=>predicate(node)?node:node.children.map(child=>find(predicate,child)).find(Boolean);
  const all=(predicate,node=doc.body)=>[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(predicate,child))];
  doc.getElementById=id=>find(node=>node.id===id);
  const win=new Events(),timers=new Map();win.document=doc;win.location={href:`https://taithai.app/${page}/`+(target?'?uid='+target:'')};win.history={replaceState(_a,_b,url){win.location.href=url;}};win.crypto=globalThis.crypto;win.navigator={onLine:true};win.sessionStorage=store;win.URL={createObjectURL:()=> 'blob:owned-preview',revokeObjectURL:url=>revoked.push(url)};win.setTimeout=(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref?.();timers.set(timer,ms);return timer;};win.clearTimeout=timer=>{clearTimeout(timer);timers.delete(timer);};win.confirm=()=>true;
  let notify,user=uid?person(uid):null;const calls=[],revoked=[];
  const request=async(url,options={})=>{const parsed=new URL(url),action=parsed.searchParams.get('action'),data=options.body?JSON.parse(options.body):null;calls.push({action,params:Object.fromEntries(parsed.searchParams),data,options});if(call){const result=await call(action,{params:Object.fromEntries(parsed.searchParams),data,options,user});if(result!==undefined)return result;}
    if(action==='me')return response(me(user.uid));if(action==='posts'||action==='threads'||action==='blocks'||action==='follows')return response({items:[],nextCursor:null});if(action==='profile')return response({profile:profile(parsed.searchParams.get('uid')||user.uid),viewer:{isSelf:parsed.searchParams.get('uid')===user?.uid,following:false,blocked:false,canMessage:true}});if(action==='messages')return response({items:[],peer:profile(parsed.searchParams.get('uid')),blocked:false,blocking:false,canMessage:true,nextCursor:null});throw Error('Unexpected '+action);
  };
  const auth={subscribeAuth(fn){notify=fn;fn(user);return()=>{notify=null;};},loginWithGoogle:async()=>{},logout:async()=>{user=null;notify?.(null);}};
  const start=()=>initSocialPage({window:win,document:doc,loadAuth:async()=>auth,request,...(uploadFile?{uploadFile}:{}),...(removeUpload?{removeUpload}:{})});
  return {doc,win,root,find,all,store,calls,revoked,timers,start,change(value){user=value?person(value):null;notify?.(user);},field:id=>doc.getElementById(id),button:text=>find(node=>node.tagName==='BUTTON'&&node.textContent.trim()===text),async input(id,value){const node=doc.getElementById(id);assert.ok(node,id);node.value=value;await node.fire('input');},async click(text){const node=find(node=>node.tagName==='BUTTON'&&node.textContent.trim()===text);assert.ok(node,'Missing button: '+text);await node.fire('click');await flush();}};
}

test('social API allows anonymous public reads but requires verified sessions for private reads and writes',async()=>{
  let user=null;const calls=[];const api=createSocialApi({getUser:()=>user,request:async(url,options)=>{calls.push({url,options});return response({items:[]});}});
  await api.call('search',{params:{q:'hello'}});assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.cache,'no-store');assert.ok(!calls[0].url.includes('token'));
  await assert.rejects(api.call('messages'),{code:'AUTH_REQUIRED'});await assert.rejects(api.call('post-create',{method:'POST',data:{}}),{code:'AUTH_REQUIRED'});user={...person(uidA),emailVerified:false};await assert.rejects(api.call('me'),{code:'AUTH_REQUIRED'});user=person(uidA);await api.call('me');assert.equal(calls[1].options.headers.Authorization,'Bearer token-alice');api.abort();
});

test('late public and private results cannot cross an account transition',async()=>{
  let user=person(uidA),release;const api=createSocialApi({getUser:()=>user,request:()=>new Promise(resolve=>{release=resolve;})});const pending=api.call('messages',{params:{uid:uidB}});await flush();user=person('other');release(response({items:[{text:'private'}]}));await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});
  let tokenReady;user={...person(uidA),getIdToken:()=>new Promise(resolve=>{tokenReady=resolve;})};let requested=false;const later=createSocialApi({getUser:()=>user,request:async()=>{requested=true;return response({});}});const work=later.call('me');user=null;tokenReady('private-token');await assert.rejects(work,{code:'ACCOUNT_CHANGED'});assert.equal(requested,false);api.abort();later.abort();
});

test('write transport failures carry unknown delivery and outboxes preserve the exact payload over reload',async()=>{
  const storage=memory(),box=createSocialOutbox({storage,uid:uidA,scope:'post'}),job=box.begin('post-create',{text:'original',attachments:[]});const api=createSocialApi({getUser:()=>person(uidA),request:async()=>response({error:{code:'SERVICE_UNAVAILABLE'}},503)});
  await assert.rejects(api.call(job.action,{method:'POST',data:{...job.data,requestId:job.requestId}}),{deliveryUnknown:true});assert.throws(()=>box.begin('post-create',{text:'changed'}),{code:'PENDING_REQUEST'});const restored=createSocialOutbox({storage,uid:uidA,scope:'post'});assert.deepEqual(restored.peek(),job);assert.equal(createSocialOutbox({storage,uid:uidB,scope:'post'}).peek(),null);restored.clear();assert.equal(restored.peek(),null);api.abort();
});

test('a successful HTTP response without the confirmed mutation result is still unknown delivery',async()=>{
  const api=createSocialApi({getUser:()=>person(uidA),request:async()=>response({})});
  await assert.rejects(api.call('post-create',{method:'POST',data:{text:'one'}}),{code:'INVALID_RESPONSE',deliveryUnknown:true});
  await assert.rejects(api.call('message-send',{method:'POST',data:{text:'one'}}),{code:'INVALID_RESPONSE',deliveryUnknown:true});api.abort();
});

test('media policy permits supported photos or one video, rejects mixed/oversized and unsafe media URLs',()=>{
  assert.equal(validateSocialFiles([{type:'video/mp4',size:104857600}]).length,1);assert.equal(validateSocialFiles(Array.from({length:4},()=>({type:'image/jpeg',size:100}))).length,4);
  assert.throws(()=>validateSocialFiles([{type:'image/svg+xml',size:5}]),{code:'MEDIA_TYPE'});assert.throws(()=>validateSocialFiles([{type:'video/mp4',size:104857601}]),{code:'MEDIA_SIZE'});assert.throws(()=>validateSocialFiles([{type:'image/jpeg',size:10485761}]),{code:'MEDIA_SIZE'});assert.throws(()=>validateSocialFiles([{type:'video/webm',size:1},{type:'image/png',size:1}]),{code:'MEDIA_MIXED'});assert.throws(()=>validateSocialFiles(Array.from({length:5},()=>({type:'image/jpeg',size:1}))),{code:'MEDIA_COUNT'});
  const id=crypto.randomUUID(),asset=crypto.randomUUID();assert.match(socialAttachmentPath(uidA,id,asset,'image/jpeg'),new RegExp(`^social-media/alice/${id}/`));assert.throws(()=>socialAttachmentPath('../bob',id,asset,'image/jpeg'));
  assert.equal(safeSocialMediaUrl('javascript:alert(1)'), '');assert.equal(safeSocialMediaUrl('https://evil.example/file.mp4'),'');assert.equal(safeSocialMediaUrl('https://googleusercontent.com.evil.example/image',{avatar:true}),'');assert.ok(safeSocialMediaUrl('https://lh3.googleusercontent.com/avatar',{avatar:true}));assert.equal(safeSocialMediaUrl('https://firebasestorage.googleapis.com/v0/b/other/o/social-media%2Falice'),'');assert.equal(publicProfileUrl('a&b'),'https://taithai.app/profile/?uid=a%26b');
  const media='https://taithai-app.netlify.app/api/social-media/?id='+asset;assert.equal(safeSocialMediaUrl(media),media);assert.equal(safeSocialMediaUrl(media+'&token=unsafe'),'');assert.equal(safeSocialMediaUrl(media.replace('taithai-app.netlify.app','other.netlify.app')),'');assert.equal(safeSocialMediaUrl(media.replace('/api/social-media/','/elsewhere/')),'');assert.equal(safeSocialMediaUrl(media+'#fragment'),'');
});

test('chunked uploads resume acknowledged parts and recover a lost acknowledgement without duplicating bytes',async()=>{
  const chunkSize=3145728,file=Object.assign(new Blob([new Uint8Array(chunkSize+123)],{type:'image/jpeg'}),{name:'photo.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type),parts=[],progress=[];let inspections=0;const uploaded=new Set([0]);
  const proofs={0:digest(new Uint8Array(chunkSize)),1:digest(new Uint8Array(123))};
  const manifest=()=>({upload:{path,type:file.type,size:file.size,name:file.name,chunkSize,totalChunks:2,uploaded:[...uploaded],uploadedDigests:Object.fromEntries([...uploaded].map(index=>[index,proofs[index]])),complete:false}});
  const request=async(url,options)=>{const parsed=new URL(url),action=parsed.searchParams.get('action');assert.equal(parsed.searchParams.has('token'),false);assert.equal(options.headers.Authorization,'Bearer token-alice');assert.equal(options.credentials,'omit');
    if(action==='start'){inspections++;return response(manifest());}
    if(action==='chunk'){const index=Number(parsed.searchParams.get('index'));parts.push(index);assert.equal(index,1);assert.equal(options.headers['Content-Type'],'application/octet-stream');assert.equal(options.body.size,123);uploaded.add(index);return response({error:{code:'SERVICE_UNAVAILABLE'}},503);}
    if(action==='complete')return response({attachment:{path,type:file.type,size:file.size,name:file.name}});throw Error(action);
  };
  const task=uploadSocialFile({file,path,user:person(uidA),getUser:()=>person(uidA),request,onProgress:value=>progress.push(value)});assert.deepEqual(await task.promise,{path,type:file.type,size:file.size,name:file.name});assert.deepEqual(parts,[1]);assert.equal(inspections,2);assert.equal(progress.at(-1),100);
});

test('completed upload retries skip binary parts and cancellation interrupts even a pending token lookup',async()=>{
  const file=Object.assign(new Blob(['photo'],{type:'image/jpeg'}),{name:'photo.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type);let chunks=0;
  const request=async(url)=>{const action=new URL(url).searchParams.get('action');if(action==='start')return response({upload:{path,type:file.type,size:file.size,name:file.name,chunkSize:3145728,totalChunks:1,uploaded:[0],uploadedDigests:{0:digest('photo')},complete:true}});if(action==='complete')return response({attachment:{path,type:file.type,size:file.size,name:file.name}});chunks++;throw Error('must not upload');};
  const ready=uploadSocialFile({file,path,user:person(uidA),getUser:()=>person(uidA),request});await ready.promise;assert.equal(chunks,0);
  const pendingUser={...person(uidA),getIdToken:()=>new Promise(()=>{})};const pending=uploadSocialFile({file,path,user:pendingUser,getUser:()=>pendingUser,request});pending.cancel();await assert.rejects(pending.promise,{code:'UPLOAD_CANCELLED'});
});

test('upload filenames normalize Mac decomposed Unicode before descriptor length checks',async()=>{
  const file=Object.assign(new Blob(['photo'],{type:'image/jpeg'}),{name:'cafe\u0301.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type);let sentName;
  const task=uploadSocialFile({file,path,user:person(uidA),getUser:()=>person(uidA),request:async(url,options)=>{
    const action=new URL(url).searchParams.get('action');if(action==='start'){sentName=JSON.parse(options.body).name;return response({upload:{path,type:file.type,size:file.size,name:sentName,chunkSize:3145728,totalChunks:1,uploaded:[0],uploadedDigests:{0:digest('photo')},complete:true}});}
    if(action==='complete')return response({attachment:{path,type:file.type,size:file.size,name:'café.jpg'}});throw Error(action);
  }});assert.equal((await task.promise).name,'café.jpg');assert.equal(sentName,'café.jpg');
});

test('upload account changes stop completion and abandoning an upload authenticates the current owner',async()=>{
  const file=Object.assign(new Blob(['photo'],{type:'image/jpeg'}),{name:'photo.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type);let user=person(uidA),release,complete=0;
  const request=async(url,options)=>{const action=new URL(url).searchParams.get('action');if(action==='start')return response({upload:{path,type:file.type,size:file.size,name:file.name,chunkSize:3145728,totalChunks:1,uploaded:[],uploadedDigests:{},complete:false}});if(action==='chunk')return new Promise(resolve=>{release=resolve;});complete++;return response({});};
  const pending=uploadSocialFile({file,path,user,getUser:()=>user,request});await flush();user=person(uidB);release(response({index:0,uploaded:true}));await assert.rejects(pending.promise,{code:'ACCOUNT_CHANGED'});assert.equal(complete,0);
  let abandon;await removeSocialUpload(path,{getUser:()=>person(uidA),request:async(url,options)=>{abandon={url,options};return response({abandoned:true});}});assert.equal(new URL(abandon.url).searchParams.get('action'),'abandon');assert.deepEqual(JSON.parse(abandon.options.body),{path});assert.equal(abandon.options.headers.Authorization,'Bearer token-alice');
});

test('reselected files with identical name/type/size cannot mix acknowledged original chunks with changed bytes',async()=>{
  const chunkSize=3145728,original=new Uint8Array(chunkSize+10),originalDigests={0:digest(original.slice(0,chunkSize)),1:digest(original.slice(chunkSize))};
  for(const changedIndex of [0,1]){
    const changed=original.slice();changed[changedIndex===0?0:chunkSize]=1;
    const file=Object.assign(new Blob([changed],{type:'image/jpeg'}),{name:'same-name.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type),calls=[];
    const task=uploadSocialFile({file,path,user:person(uidA),getUser:()=>person(uidA),request:async url=>{const action=new URL(url).searchParams.get('action');calls.push(action);if(action==='start')return response({upload:{path,type:file.type,size:file.size,name:file.name,chunkSize,totalChunks:2,uploaded:[0,1],uploadedDigests:originalDigests,complete:true}});throw Error('must not send changed chunks or complete');}});
    await assert.rejects(task.promise,{code:'UPLOAD_FILE_CHANGED',status:409});assert.deepEqual(calls,['start']);
  }
  assert.match(socialErrorText({code:'UPLOAD_FILE_CHANGED'},'en'),/original file/);
});

test('acknowledged chunks without a digest proof never become skippable upload data',async()=>{
  const file=Object.assign(new Blob(['photo'],{type:'image/jpeg'}),{name:'photo.jpg'}),path=socialAttachmentPath(uidA,crypto.randomUUID(),crypto.randomUUID(),file.type);let writes=0;
  const task=uploadSocialFile({file,path,user:person(uidA),getUser:()=>person(uidA),request:async url=>{const action=new URL(url).searchParams.get('action');if(action==='start')return response({upload:{path,type:file.type,size:file.size,name:file.name,chunkSize:3145728,totalChunks:1,uploaded:[0],uploadedDigests:{},complete:true}});writes++;throw Error(action);}});
  await assert.rejects(task.promise,{code:'INVALID_RESPONSE'});assert.equal(writes,0);
});

test('video fallback requests only bounded verified byte ranges after being explicitly invoked',async()=>{
  const size=3145728+10,url='https://taithai-app.netlify.app/api/social-media/?id='+crypto.randomUUID(),ranges=[];
  const task=fetchSocialVideo({url,size,type:'video/mp4',request:async(_url,options)=>{ranges.push(options.headers.Range);const [,start,end]=options.headers.Range.match(/bytes=(\d+)-(\d+)/).map(Number);return {status:206,headers:new Headers({'content-range':`bytes ${start}-${end}/${size}`}),arrayBuffer:async()=>new ArrayBuffer(end-start+1)};}});
  const video=await task.promise;assert.equal(video.size,size);assert.deepEqual(ranges,['bytes=0-3145727','bytes=3145728-3145737']);
  const bad=fetchSocialVideo({url,size,type:'video/mp4',request:async()=>({status:200,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(size)})});await assert.rejects(bad.promise,{code:'INVALID_MEDIA'});
});

test('guest feed renders untrusted post/profile text as text and never creates a public account automatically',async()=>{
  const f=fixture({uid:null,call:async action=>action==='posts'?response({items:[{id:'one',uid:uidB,author:{...profile(uidB),displayName:'<img src=x onerror=alert(1)>',photoURL:'javascript:alert(1)'},text:'<script>private()</script>',attachments:[],createdAt:'2026-11-21T00:00:00Z'}],nextCursor:null}):undefined});const controller=f.start();await flush();assert.match(f.root.textContent,/Sign in with Google/);assert.match(f.root.textContent,/<script>private\(\)<\/script>/);assert.equal(f.all(node=>node.tagName==='SCRIPT'||node.tagName==='IMG').length,0);assert.ok(!f.calls.some(call=>call.data));assert.equal(f.field('socialPostText'),undefined);controller.destroy();
});

test('profile setup requires an explicit save and uses verified server photo defaults, not client photo claims',async()=>{
  let created=false;const writes=[];const f=fixture({page:'profile',call:async(action,{data})=>{
    if(action==='me')return response({...me(uidA),profile:created?profile(uidA):null});if(action==='profile'&&!created)return response({error:{code:'PROFILE_NOT_FOUND'}},404);
    if(action==='profile-update'){writes.push(data);created=true;return response({profile:{...profile(uidA),handle:data.handle,displayName:data.displayName,bio:data.bio}});}
  }});const controller=f.start();await flush();assert.ok(f.field('socialProfileForm'));assert.equal(writes.length,0);assert.equal(f.field('socialBio').maxLength,300);
  await f.input('socialHandle','alice_new');await f.input('socialDisplayName','Alice');await f.input('socialBio','Hello');await f.field('socialProfileForm').fire('submit');await flush();assert.equal(writes.length,1);assert.equal(writes[0].photoURL,'https://lh3.googleusercontent.com/server-photo');assert.equal(writes[0].handle,'alice_new');assert.ok(writes[0].requestId);assert.match(f.root.textContent,/Saved/);controller.destroy();
});

test('a failed post stays immutable through reload and retries the exact same request',async()=>{
  const store=memory(),writes=[];let attempt=0;const call=async(action,{data})=>{if(action==='post-create'){writes.push(data);if(++attempt===1)return response({error:{code:'SERVICE_UNAVAILABLE'}},503);return response({post:{id:data.requestId,uid:uidA,author:profile(uidA),text:data.text,attachments:[],createdAt:'2026-11-21T00:00:00Z',canEdit:true}});}};
  const first=fixture({store,call});let controller=first.start();await flush();await first.input('socialPostText','A public story');await first.click('Publish post');assert.equal(writes.length,1);assert.equal(first.field('socialPostText').disabled,true);assert.ok(first.button('Check original request'));controller.destroy();
  const second=fixture({store,call});controller=second.start();await flush();assert.equal(second.field('socialPostText').value,'A public story');assert.equal(second.field('socialPostText').disabled,true);await second.click('Check original request');assert.deepEqual(writes[0],writes[1]);assert.match(second.root.textContent,/Post published/);assert.equal(second.field('socialPostText').value,'');controller.destroy();
});

test('photos upload to the current UID/post path and only verified upload metadata is submitted',async()=>{
  const uploads=[],writes=[];const f=fixture({uploadFile:args=>{uploads.push(args);return {promise:Promise.resolve({path:args.path,type:args.file.type,size:args.file.size,name:args.file.name}),cancel(){}};},removeUpload:async()=>{},call:async(action,{data})=>{if(action==='post-create'){writes.push(data);return response({post:{id:data.requestId,uid:uidA,author:profile(uidA),text:data.text,attachments:[],createdAt:'2026-11-21T00:00:00Z',canEdit:true}});}}});const controller=f.start();await flush();const input=f.field('socialMediaInput');input.files=[{name:'photo.jpg',type:'image/jpeg',size:100}];await input.fire('change');await flush();assert.equal(uploads.length,1);assert.match(uploads[0].path,/^social-media\/alice\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);await f.click('Publish post');assert.equal(writes.length,1);assert.equal(writes[0].requestId,uploads[0].path.split('/')[2]);assert.deepEqual(Object.keys(writes[0].attachments[0]).sort(),['name','path','size','type']);assert.ok(f.revoked.includes('blob:owned-preview'));controller.destroy();
});

test('an interrupted upload survives reload and resumes the original path only after selecting the original file',async()=>{
  const store=memory(),firstUploads=[];const original={name:'original.jpg',type:'image/jpeg',size:100};
  const first=fixture({store,uploadFile:args=>{firstUploads.push(args);args.onProgress(25);return {promise:new Promise(()=>{}),cancel(){}};}});let controller=first.start();await flush();const file=first.field('socialMediaInput');file.files=[original];await file.fire('change');await flush();const path=firstUploads[0].path;controller.destroy();
  const resumed=[];const second=fixture({store,uploadFile:args=>{resumed.push(args);return {promise:Promise.resolve({path:args.path,type:args.file.type,size:args.file.size,name:args.file.name}),cancel(){}};}});controller=second.start();await flush();assert.ok(second.button('Choose original file to resume'));const picker=second.find(node=>node.tagName==='INPUT'&&node.id?.startsWith('socialResume-'));picker.files=[{...original,size:101}];await picker.fire('change');await flush();assert.equal(resumed.length,0);const current=second.find(node=>node.tagName==='INPUT'&&node.id?.startsWith('socialResume-'));current.files=[original];await current.fire('change');await flush();assert.equal(resumed.length,1);assert.equal(resumed[0].path,path);assert.match(second.root.textContent,/Uploaded/);controller.destroy();
});

test('rendering a public video does not prefetch the full file or start fallback reads',async()=>{
  const asset={path:'public-video',url:'https://taithai-app.netlify.app/api/social-media/?id='+crypto.randomUUID(),size:104857600,type:'video/mp4',name:'clip.mp4'};
  const f=fixture({uid:null,call:async action=>action==='posts'?response({items:[{id:'video',uid:uidB,author:profile(uidB),text:'A clip',attachments:[asset],createdAt:'2026-11-21T00:00:00Z'}],nextCursor:null}):undefined});const controller=f.start();await flush();const player=f.find(node=>node.tagName==='VIDEO');assert.ok(player);assert.equal(player.preload,'metadata');assert.equal(player.src,asset.url);assert.ok(!f.calls.some(call=>call.options.headers.Range));const controls=f.find(node=>node.className==='social-video-controls');assert.equal(controls.hidden,true);await player.fire('error');assert.equal(controls.hidden,false);assert.ok(f.button('Load video to play'));assert.ok(!f.calls.some(call=>call.options.headers.Range));controller.destroy();
});

test('invalid media is rejected before upload and a logout cancels uploads and removes private drafts',async()=>{
  let release,cancelled=0,uploads=0;const f=fixture({uploadFile:()=>{uploads++;return {promise:new Promise(resolve=>{release=resolve;}),cancel(){cancelled++;}};},removeUpload:async()=>{}});const controller=f.start();await flush();let input=f.field('socialMediaInput');input.files=[{name:'script.svg',type:'image/svg+xml',size:20}];await input.fire('change');await flush();assert.equal(uploads,0);assert.match(f.root.textContent,/JPEG/);
  await f.input('socialPostText','PRIVATE DRAFT');input=f.field('socialMediaInput');input.files=[{name:'photo.jpg',type:'image/jpeg',size:100}];await input.fire('change');await flush();f.change(null);await flush();assert.ok(cancelled>0);release({path:'old-private-file',type:'image/jpeg',size:100,name:'photo.jpg'});await flush();assert.ok(!f.root.textContent.includes('PRIVATE DRAFT'));assert.ok(![...Array(f.store.length)].map((_,i)=>f.store.getItem(f.store.key(i))).some(value=>value?.includes('PRIVATE DRAFT')));controller.destroy();
});

test('late conversation messages cannot enter another signed-in account',async()=>{
  let release;const f=fixture({page:'messages',target:uidB,call:async(action,{user})=>{if(action==='messages'&&user.uid===uidA)return new Promise(resolve=>{release=resolve;});}});const controller=f.start();await flush();f.change('charlie');await flush();release(response({items:[{id:'secret',senderUid:uidB,text:'PRIVATE OLD ACCOUNT',createdAt:'2026-11-21T00:00:00Z'}],peer:profile(uidB),blocked:false,blocking:false,canMessage:true}));await flush();assert.ok(!f.root.textContent.includes('PRIVATE OLD ACCOUNT'));assert.ok(f.calls.some(call=>call.options.headers.Authorization==='Bearer token-charlie'));controller.destroy();
});

test('uncertain private sends retain one immutable ID and clear the draft only after confirmation',async()=>{
  const writes=[];let attempt=0;const f=fixture({page:'messages',target:uidB,call:async(action,{data})=>{if(action==='message-send'){writes.push(data);if(++attempt===1)return response({error:{code:'SERVICE_UNAVAILABLE'}},503);return response({message:{id:data.requestId,senderUid:uidA,text:data.text,isMine:true,createdAt:'2026-11-21T00:00:00Z'},threadId:'thread'});}}});const controller=f.start();await flush();await f.input('socialMessageText','A private hello');await f.field('socialMessageForm').fire('submit');await flush();assert.equal(f.field('socialMessageText').disabled,true);assert.equal(f.field('socialMessageText').value,'A private hello');await f.click('Check original request');assert.deepEqual(writes[0],writes[1]);assert.equal(f.field('socialMessageText').value,'');assert.equal(f.all(node=>node.className==='social-message mine').length,1);controller.destroy();
});

test('switching conversations during delivery clears only the delivered recipient draft',async()=>{
  let deliver;const f=fixture({page:'messages',target:uidB,call:async(action,{data})=>{
    if(action==='threads')return response({items:[{id:'bob-thread',peer:profile(uidB),lastMessage:{text:'Hello'}},{id:'charlie-thread',peer:profile('charlie'),lastMessage:{text:'Hi'}}],nextCursor:null});
    if(action==='message-send')return new Promise(resolve=>{deliver=()=>resolve(response({message:{id:data.requestId,senderUid:uidA,text:data.text,isMine:true,createdAt:'2026-11-21T00:00:00Z'},threadId:'bob-thread'}));});
  }});f.store.setItem('taithai.social.draft.v1:alice:message:charlie',JSON.stringify({text:'Draft for Charlie'}));const controller=f.start();await flush();await f.input('socialMessageText','For Bob');await f.field('socialMessageForm').fire('submit');await flush();const charlie=f.find(node=>node.tagName==='BUTTON'&&node.className.includes('social-thread')&&node.textContent.includes('CHARLIE'));await charlie.fire('click');await flush();deliver();await flush();assert.equal(f.field('socialMessageText').value,'Draft for Charlie');const bob=f.find(node=>node.tagName==='BUTTON'&&node.className.includes('social-thread')&&node.textContent.includes('BOB'));await bob.fire('click');await flush();assert.equal(f.field('socialMessageText').value,'');assert.equal(f.field('socialMessageText').disabled,false);controller.destroy();
});

test('a peer block cannot be undone by the recipient and blocked conversation cannot send',async()=>{
  const f=fixture({page:'messages',target:uidB,call:async action=>action==='messages'?response({items:[],peer:profile(uidB),blocked:true,blocking:false,canMessage:false}):undefined});const controller=f.start();await flush();assert.equal(f.field('socialMessageText'),undefined);assert.ok(f.button('Block account'));assert.equal(f.button('Unblock'),undefined);assert.ok(!f.calls.some(call=>call.action==='message-send'));controller.destroy();
});

test('post deletion stays retryable when physical media cleanup is not confirmed',async()=>{
  let deleted=false;const writes=[];const original={id:crypto.randomUUID(),uid:uidA,author:profile(uidA),text:'My post',attachments:[],createdAt:'2026-11-21T00:00:00Z',canEdit:true};const f=fixture({call:async(action,{data})=>{if(action==='posts')return response({items:deleted?[]:[original],nextCursor:null});if(action==='post-delete'){writes.push(data);deleted=true;return response({id:original.id,deleted:true,cleanupPending:writes.length===1});}}});const controller=f.start();await flush();await f.click('Delete post');assert.match(f.root.textContent,/media deletion is not confirmed/);assert.equal(f.all(node=>node.id==='post-'+original.id).length,0);await f.click('Check original request');assert.deepEqual(writes[0],writes[1]);assert.match(f.root.textContent,/Post deleted/);controller.destroy();
});

test('hidden message pages do not start automatic polling and BFCache removes private page content',async()=>{
  const f=fixture({page:'messages',target:uidB});f.doc.visibilityState='hidden';const controller=f.start();await flush();assert.ok(![...f.timers.values()].includes(15000));await f.input('socialMessageText','PRIVATE BFCACHE');await f.win.fire('pagehide');assert.ok(!f.root.textContent.includes('PRIVATE BFCACHE'));await f.win.fire('pageshow',{persisted:true});await flush();assert.equal(f.field('socialMessageText').value,'PRIVATE BFCACHE');controller.destroy();
});

test('all social pages retain keyboard-first landmarks, shared search, localization and reduced motion support',async()=>{
  for(const page of ['community','profile','messages']){const html=await readFile(new URL(`../${page}/index.html`,import.meta.url),'utf8');assert.match(html,/<main[^>]*id="main"/);assert.match(html,/class="skip-link"/);assert.match(html,/data-social-page=/);assert.match(html,/site-search\.js/);assert.match(html,/site-social\.js/);assert.match(html,/<noscript>/);assert.match(html,/data-language="en"/);assert.match(html,/data-language="th"/);}
  const css=await readFile(new URL('../assets/site-social.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/transition:\s*all|animation:[^;]*infinite/);assert.match(socialErrorText({code:'CONTACT_UNAVAILABLE'},'th'),/ติดต่อ/);assert.match(socialErrorText({},'en',false),/offline/);
});
