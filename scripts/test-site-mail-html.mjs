import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIL_HTML_LIMITS, sanitizeMailHtml, mailHtmlCidReferences, mailInlineImageData } from '../server-lib/site-mail-html.js';
import { createMailProtocolAdapters, MAIL_LIMITS } from '../server-lib/site-mail.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKD8AAAAASUVORK5CYII=','base64');
const credentials={address:'official@taithai.app',password:'synthetic-fixture-password',provider:'hostinger'};
const ref={folder:'INBOX',uid:42,uidValidity:'123'};

function mimeFixture(structure, contents, overrides={}) {
  const downloads=[];
  class FakeImap {
    constructor(){this.mailbox={uidValidity:123n};} on(){} async connect(){} async logout(){} close(){}
    async list(){return [{path:'INBOX',flags:new Set()}];}
    async getMailboxLock(){return {release(){}};}
    async fetchOne(){return {uid:42,envelope:{},flags:new Set(),bodyStructure:structure};}
    async download(uid,part,options){
      assert.equal(uid,42);assert.equal(options.uid,true);downloads.push({part,options});
      if(overrides.failPart===part)throw Error('Fixture MIME part unavailable');
      const bytes=Buffer.isBuffer(contents[part])?contents[part]:Buffer.from(contents[part]||'');
      return {meta:{charset:'utf-8'},content:(async function*(){yield bytes.subarray(0,options.maxBytes);})()};
    }
  }
  const {imap}=createMailProtocolAdapters({ImapFlow:FakeImap,createTransport(){},simpleParser(){},env:{MAIL_PROVIDER:'hostinger'}});
  return {imap,downloads};
}

test('newsletter tables, inline typography and public HTTPS images survive without active content',()=>{
 const result=sanitizeMailHtml('<html><head><style>@import "https://evil.org/x"</style></head><body><table width="600" cellpadding="12" style="background-color:#fafafa;color:#222;font-family:Arial,sans-serif"><tr><td><h2>Hello</h2><img src="https://cdn.example.org/logo.png" onerror="evil()"><a href="https://taithai.app/help/?token=Exact%2BCase&amp;x=Y" target="_top">Continue</a></td></tr></table><script>evil()</script></body></html>');
 assert.equal(result.hasHtml,true);assert.equal(result.htmlTruncated,false);
 assert.match(result.html,/<table width="600" cellpadding="12"/);assert.match(result.html,/font-family:Arial,sans-serif/);
 assert.match(result.html,/src="https:\/\/cdn.example.org\/logo.png"/);assert.match(result.html,/referrerpolicy="no-referrer"/);
 assert.match(result.html,/href="https:\/\/taithai.app\/help\/\?token=Exact%2BCase&amp;x=Y" target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(result.html,/script|onerror|evil\(|@import|<html|<head|<body|_top/);
});

test('scripts, event handlers, foreign content, forms and document navigation are removed',()=>{
 const html=sanitizeMailHtml('<meta http-equiv="refresh" content="0;url=https://evil.org"><base href="https://evil.org"><iframe srcdoc="evil"></iframe><object data="https://evil.org"><p>object bait</p></object><svg><foreignObject><img src="https://evil.org/a"></foreignObject></svg><math><mi>x</mi></math><form action="https://evil.org"><input name="password"><button>Submit</button></form><div id="mailPanel" class="overlay" onclick="evil()" autofocus>Visible</div>').html;
 assert.equal(html,'<div>Visible</div>');
});

test('image URLs reject credentials, local/private/literal IP targets, own APIs and unsafe schemes',()=>{
 const blocked=['http://cdn.example.org/a','//cdn.example.org/a','/api/membership','javascript:evil()','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=',
  'https://u:p@cdn.example.org/a','https://127.0.0.1/a','https://0x7f000001/a','https://192.0.0.1/a','https://198.18.0.1/a','https://8.8.8.8/a','https://[::1]/a','https://localhost../a','https://host.local/a','https://host.internal/a','https://taithai.app/api/membership/','https://taithai-app.netlify.app/api/membership/'];
 for(const src of blocked)assert.doesNotMatch(sanitizeMailHtml(`<img src="${src}">`).html,/\ssrc=/,src);
 assert.match(sanitizeMailHtml('<img src="https://images.example.com/a">').html,/src="https:\/\/images.example.com\/a"/);
});

test('CSS never retains resource URLs, escaped functions, custom properties or viewport overlays',()=>{
 for(const style of ['background-image:url(https://evil.org/a)','background:u\\72l(https://evil.org/a)','width:expression(evil())','--x:url(https://evil.org/a);color:var(--x)','behavior:evil','-moz-binding:evil','background-image:image-set("https://evil.org/a")','@import "https://evil.org/a"'])assert.doesNotMatch(sanitizeMailHtml(`<div style="${style.replaceAll('"','&quot;')}">Text</div>`).html,/style=/,style);
 const html=sanitizeMailHtml('<p style="position:fixed;z-index:99999;left:0;top:0;color:#333;padding:12px 24px;border:1px solid #ddd;text-align:center">Text</p>').html;
 assert.match(html,/color:#333;padding:12px 24px;border:1px solid #ddd;text-align:center/);assert.doesNotMatch(html,/position|z-index|left|top/);
});

test('srcset only retains complete public HTTPS candidates with bounded descriptors',()=>{
 assert.match(sanitizeMailHtml('<img src="https://cdn.example.org/a.png" srcset="https://cdn.example.org/a.png 1x, https://cdn.example.org/b.png 2x">').html,/srcset="https:\/\/cdn.example.org\/a.png 1x, https:\/\/cdn.example.org\/b.png 2x"/);
 for(const set of ['https://cdn.example.org/a.png 1x, javascript:evil 2x','https://127.0.0.1/a 1x','data:image/png;base64,AAAA 1x','https://cdn.example.org/a.png 999x'])assert.doesNotMatch(sanitizeMailHtml(`<img srcset="${set}">`).html,/srcset=/);
});

test('inline raster data requires matching magic, dimensions, canonical base64 and byte bounds',()=>{
 const data=mailInlineImageData(PNG,'image/png');assert.match(data,/^data:image\/png;base64,/);assert.match(sanitizeMailHtml(`<img src="${data}">`).html,/src="data:image\/png;base64,/);
 for(const [bytes,type]of [[Buffer.from('<svg onload="evil()">'),'image/png'],[PNG,'image/jpeg'],[PNG,'image/svg+xml'],[Buffer.alloc(MAIL_HTML_LIMITS.inlineImageBytes+1),'image/png']])assert.equal(mailInlineImageData(bytes,type),'');
 const huge=Buffer.from(PNG);huge.writeUInt32BE(100000,16);assert.equal(mailInlineImageData(huge,'image/png'),'');
 assert.doesNotMatch(sanitizeMailHtml(`<img src="${data.replace('base64,','base64, ')}">`).html,/\ssrc=/);
});

test('CID references are normalized once, deduplicated, bounded and isolated from hidden script content',()=>{
 assert.deepEqual(mailHtmlCidReferences('<img src="CID:Logo%40Example"><img src="cid:logo@example"><script><img src="cid:hidden"></script><img src="cid:bad%0aid">'),['logo@example']);
 assert.equal(mailHtmlCidReferences(Array.from({length:20},(_,i)=>`<img src="cid:image${i}">`).join('')).length,MAIL_HTML_LIMITS.inlineImages);
 const html=sanitizeMailHtml('<img src="cid:logo@example"><img src="cid:missing">',{inlineImages:new Map([['logo@example',mailInlineImageData(PNG,'image/png')]])}).html;
 assert.equal((html.match(/src="data:image\/png/g)||[]).length,1);assert.doesNotMatch(html,/cid:/);
});

test('HTML input, nesting, expanded output and number of remote images stay bounded',()=>{
 for(const input of ['x'.repeat(MAIL_HTML_LIMITS.inputBytes+1),'ก'.repeat(200000),'<div>'.repeat(65)+'text'+'</div>'.repeat(65)])assert.deepEqual(sanitizeMailHtml(input),{html:'',hasHtml:false,htmlTruncated:true});
 const padded=Buffer.concat([PNG,Buffer.alloc(64000-PNG.length)]),data=mailInlineImageData(padded,'image/png');
 assert.equal(sanitizeMailHtml('<img src="cid:x">'.repeat(10),{inlineImages:new Map([['x',data]])}).htmlTruncated,true);
 assert.equal((sanitizeMailHtml('<img src="https://cdn.example.org/a.png">'.repeat(120)).html.match(/\ssrc=/g)||[]).length,MAIL_HTML_LIMITS.images);
});

test('IMAP fetches both nonempty text and HTML alternatives without downloading full MIME source',async()=>{
 const f=mimeFixture({type:'multipart/alternative',childNodes:[{type:'text/plain',part:'1'},{type:'text/html',part:'2'}]}, {'1':'Plain fallback','2':'<p style="color:#333">Formatted</p><img src="https://cdn.example.org/logo.png">'});
 const result=await f.imap.message(credentials,ref);assert.equal(result.text,'Plain fallback');assert.equal(result.hasHtml,true);assert.match(result.html,/Formatted/);assert.match(result.html,/cdn.example.org/);
 assert.deepEqual(f.downloads.map(x=>x.part),['1','2']);assert.equal(f.downloads[0].options.maxBytes,64*1024);assert.equal(f.downloads[1].options.maxBytes,MAIL_LIMITS.maxBodyBytes-Buffer.byteLength('Plain fallback'));assert.ok(f.downloads.every(x=>x.options.decodeText===true));
});

test('real single-part root HTML schema without part is downloaded through ImapFlow part 1',async()=>{
 const structure={type:'text/html',parameters:{charset:'utf-8'},encoding:'quoted-printable',size:21361,lineCount:243};
 const f=mimeFixture(structure,{'1':'<html><body><table><tr><td>Welcome</td></tr></table><img src="https://cdn.example.org/welcome.png"></body></html>'});
 const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads.map(x=>x.part),['1']);assert.equal(f.downloads[0].options.decodeText,true);assert.equal(result.hasHtml,true);assert.match(result.html,/<table>/);assert.match(result.html,/src="https:\/\/cdn.example.org\/welcome.png"/);assert.match(result.text,/Welcome/);
 assert.equal(Object.hasOwn(structure,'part'),false);
});

test('single-part root plain messages without part remain readable without fetching raw source',async()=>{
 const f=mimeFixture({type:'text/plain',parameters:{charset:'utf-8'},encoding:'7bit',size:24,lineCount:1},{'1':'Readable single-part mail'});
 const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads.map(x=>x.part),['1']);assert.equal(result.text,'Readable single-part mail');assert.equal(result.html,'');
});

test('missing part on an attachment or nested malformed node never becomes a root text download',async()=>{
 for(const structure of [{type:'text/html',disposition:'attachment',parameters:{name:'attached.html'}},{type:'multipart/mixed',childNodes:[{type:'text/html',parameters:{charset:'utf-8'}}]}]){
  const f=mimeFixture(structure,{'1':'Private nested or attached HTML'});const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads,[]);assert.equal(result.text,'');assert.equal(result.html,'');
 }
});

test('IMAP only downloads referenced, unambiguous raster CID parts and validates their bytes',async()=>{
 const structure={type:'multipart/related',childNodes:[{type:'text/html',part:'1'},{type:'image/png',part:'2',id:'<Logo@Example>',size:PNG.length},{type:'image/png',part:'3',id:'<Unused@Example>',size:PNG.length},{type:'application/pdf',part:'4',id:'<Pdf@Example>',size:20}]};
 const f=mimeFixture(structure,{'1':'<p>Hello</p><img src="cid:logo%40example"><img src="cid:Pdf@Example">','2':PNG,'3':PNG,'4':Buffer.from('private pdf')});
 const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads.map(x=>x.part),['1','2']);assert.equal(f.downloads[1].options.decodeText,false);assert.ok(f.downloads[1].options.maxBytes<=MAIL_HTML_LIMITS.inlineImageBytes);assert.match(result.html,/data:image\/png;base64,/);assert.doesNotMatch(result.html,/cid:|private pdf/);assert.equal(result.htmlTruncated,true);
});

test('duplicate and spoofed CID parts omit only those images while preserving readable content',async()=>{
 const duplicate=mimeFixture({type:'multipart/related',childNodes:[{type:'text/html',part:'1'},{type:'image/png',part:'2',id:'<Logo>'},{type:'image/png',part:'3',id:'<logo>'}]},{'1':'<p>Readable</p><img src="cid:logo">','2':PNG,'3':PNG});
 let result=await duplicate.imap.message(credentials,ref);assert.deepEqual(duplicate.downloads.map(x=>x.part),['1']);assert.match(result.html,/Readable/);assert.doesNotMatch(result.html,/\ssrc=/);assert.equal(result.htmlTruncated,true);
 const spoofed=mimeFixture({type:'multipart/related',childNodes:[{type:'text/html',part:'1'},{type:'image/png',part:'2',id:'<logo>',size:20}]},{'1':'<p>Readable</p><img src="cid:logo">','2':'<svg onload="evil()">'});
 result=await spoofed.imap.message(credentials,ref);assert.doesNotMatch(result.html,/\ssrc=|onload|evil/);assert.match(result.text,/Readable/);
});

test('CID limits apply to decoded bytes rather than base64 BODYSTRUCTURE size',async()=>{
 const bytes=Buffer.concat([PNG,Buffer.alloc(60*1024-PNG.length)]);
 const f=mimeFixture({type:'multipart/related',childNodes:[{type:'text/html',part:'1'},{type:'image/png',part:'2',id:'<logo>',encoding:'base64',size:Math.ceil(bytes.length/3)*4}]},{'1':'<p>Logo</p><img src="cid:logo">','2':bytes});
 const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads.map(x=>x.part),['1','2']);assert.match(result.html,/src="data:image\/png;base64,/);assert.equal(result.htmlTruncated,false);
});

test('CID expansion shares one aggregate MIME byte budget and nested email attachments stay unread',async()=>{
 const source='<p>'+ 'x'.repeat(MAIL_LIMITS.maxBodyBytes-64*1024-40)+'</p><img src="cid:logo">';
 const f=mimeFixture({type:'multipart/mixed',childNodes:[{type:'multipart/alternative',childNodes:[{type:'text/plain',part:'1'},{type:'text/html',part:'2'}]},{type:'image/png',part:'3',id:'<logo>',size:PNG.length},{type:'message/rfc822',part:'4',childNodes:[{type:'text/html',part:'4.1'}]}]},{'1':'x'.repeat(64*1024),'2':source,'3':PNG,'4.1':'<p>Private nested mail</p>'});
 const result=await f.imap.message(credentials,ref);assert.deepEqual(f.downloads.map(x=>x.part),['1','2','3']);assert.ok(f.downloads[2].options.maxBytes<PNG.length);assert.equal(result.htmlTruncated,true);assert.equal(result.attachments.some(x=>x.type==='message/rfc822'),true);assert.doesNotMatch(result.html,/Private nested mail/);
});

test('an unavailable HTML alternative retains the readable text fallback',async()=>{
 const f=mimeFixture({type:'multipart/alternative',childNodes:[{type:'text/plain',part:'1'},{type:'text/html',part:'2'}]},{'1':'Still readable'}, {failPart:'2'});
 const result=await f.imap.message(credentials,ref);assert.equal(result.text,'Still readable');assert.equal(result.html,'');assert.equal(result.htmlTruncated,true);
});
