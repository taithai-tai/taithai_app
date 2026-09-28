export const context = 'taithai-new-v1';
export function encode(bytes) { return btoa(Array.from(new Uint8Array(bytes),b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export function decode(s) { if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('Invalid encoding');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)); }
export async function importPair(pair) {
 if(pair?.version!==1||!/^[-a-zA-Z0-9]{20,80}$/.test(pair.feed)||decode(pair.key).length!==32)throw new Error('Invalid pairing');
 return {feed:pair.feed,key:await crypto.subtle.importKey('raw',decode(pair.key),'AES-GCM',false,['encrypt','decrypt'])};
}
export async function encrypt(key,value,label=context) {const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(label)},key,new TextEncoder().encode(JSON.stringify(value)));return {version:1,iv:encode(iv),data:encode(data)};}
export async function decrypt(key,box,label=context) {if(box?.version!==1||decode(box.iv).length!==12)throw new Error('Invalid envelope');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv),additionalData:new TextEncoder().encode(label)},key,decode(box.data))));}
export function validateArchive(a) {if(a?.version!==1||!Array.isArray(a.editions)||!a.editions.length||a.editions.length>1000)throw new Error('Invalid archive');const seen=new Set();for(const e of a.editions){if(typeof e.id!=='string'||seen.has(e.id)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.createdAt))||typeof e.headline!=='string'||!['events','stories','deadlines','alerts'].every(k=>Array.isArray(e[k])))throw new Error('Invalid edition');seen.add(e.id);}return {...a,editions:[...a.editions].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))};}
export function safeLink(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export function bangkokDate(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
