import sanitizeHtml from 'sanitize-html';

// Email HTML is data. This allowlist is independent of the opaque, scriptless
// iframe used by the reader. No remote resource is fetched by this module.
export const MAIL_HTML_LIMITS = Object.freeze({ inputBytes: 512 * 1024, outputBytes: 512 * 1024,
  inlineImageBytes: 64 * 1024, inlineImages: 8, imageDimension: 4096, images: 100 });
const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BLOCKED_HOSTS = new Set(['taithai.app', 'taithai-app.netlify.app', 'localhost']);
const TAGS = ['a','abbr','b','blockquote','br','caption','center','code','col','colgroup','dd','del','div','dl','dt','em','figcaption','figure',
  'h1','h2','h3','h4','h5','h6','hr','i','img','ins','li','ol','p','pre','s','small','span','strong','sub','sup','table','tbody','td','tfoot','th','thead','tr','u','ul','wbr'];
const NO_CONTENT = ['script','style','textarea','noscript','iframe','object','embed','template','svg','math','canvas','video','audio','form','select','option','button','head'];
const LENGTH = /^(?:0|auto|\d{1,5}(?:\.\d{1,3})?(?:px|pt|em|rem|%|ch|vw|vh))$/i;
const SPACING = /^(?:(?:0|auto|\d{1,5}(?:\.\d{1,3})?(?:px|pt|em|rem|%))\s*){1,4}$/i;
const COLOR = /^(?:#[a-f0-9]{3,8}|[a-z]{1,24}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i;
const STYLES = {
  'color': [COLOR], 'background-color': [COLOR], 'background': [COLOR],
  'font-family': [/^[a-z0-9\s,'"-]{1,160}$/i], 'font-size': [LENGTH], 'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
  'font-style': [/^(?:normal|italic|oblique)$/i], 'font-variant': [/^(?:normal|small-caps)$/i],
  'line-height': [/^(?:normal|\d{1,3}(?:\.\d{1,3})?|\d{1,5}(?:\.\d{1,3})?(?:px|pt|em|rem|%))$/i],
  'letter-spacing': [LENGTH], 'word-spacing': [LENGTH], 'text-align': [/^(?:left|right|center|justify|start|end)$/i],
  'text-decoration': [/^(?:(?:none|underline|line-through|overline)\s*){1,3}$/i],
  'text-transform': [/^(?:none|uppercase|lowercase|capitalize)$/i], 'text-indent': [LENGTH],
  'white-space': [/^(?:normal|pre|pre-wrap|pre-line|nowrap|break-spaces)$/i],
  'word-break': [/^(?:normal|break-all|keep-all|break-word)$/i], 'overflow-wrap': [/^(?:normal|anywhere|break-word)$/i],
  'vertical-align': [/^(?:baseline|middle|top|bottom|text-top|text-bottom|sub|super|0|\d{1,4}(?:px|pt|em|%))$/i],
  'display': [/^(?:none|block|inline|inline-block|table|table-row|table-cell|table-row-group|table-header-group|table-footer-group|flex|inline-flex)$/i],
  'width': [LENGTH], 'height': [LENGTH], 'max-width': [LENGTH], 'max-height': [LENGTH], 'min-width': [LENGTH], 'min-height': [LENGTH],
  'margin': [SPACING], 'padding': [SPACING],
  ...Object.fromEntries(['margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left'].map(key => [key, [LENGTH]])),
  'border': [/^[a-z0-9#.,()%\s-]{1,100}$/i], 'border-top': [/^[a-z0-9#.,()%\s-]{1,100}$/i], 'border-right': [/^[a-z0-9#.,()%\s-]{1,100}$/i],
  'border-bottom': [/^[a-z0-9#.,()%\s-]{1,100}$/i], 'border-left': [/^[a-z0-9#.,()%\s-]{1,100}$/i],
  'border-color': [COLOR], 'border-width': [SPACING], 'border-style': [/^(?:(?:none|solid|dashed|dotted|double)\s*){1,4}$/i],
  'border-radius': [SPACING], 'border-collapse': [/^(?:collapse|separate)$/i], 'border-spacing': [SPACING],
  'table-layout': [/^(?:auto|fixed)$/i], 'list-style-type': [/^(?:none|disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/i],
  'direction': [/^(?:ltr|rtl)$/i], 'box-sizing': [/^(?:border-box|content-box)$/i],
  'align-items': [/^(?:normal|stretch|start|end|center|baseline|flex-start|flex-end)$/i],
  'justify-content': [/^(?:normal|start|end|center|space-between|space-around|space-evenly|flex-start|flex-end)$/i],
  'flex-direction': [/^(?:row|column|row-reverse|column-reverse)$/i], 'flex-wrap': [/^(?:wrap|nowrap|wrap-reverse)$/i], 'gap': [SPACING]
};

function boundedHtml(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAIL_HTML_LIMITS.inputBytes) return false;
  let depth = 0, tags = 0;
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for (const match of value.matchAll(/<\s*(\/?)([a-z][a-z0-9:-]*)\b/gi)) {
    if (++tags > 10000) return false;
    if (voids.has(match[2].toLowerCase())) continue;
    depth = match[1] ? Math.max(0, depth - 1) : depth + 1;
    if (depth > 64) return false;
  }
  return true;
}

function blockedHost(host, image) {
  host = host.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (image && BLOCKED_HOSTS.has(host) || host === 'localhost' || !host.includes('.') || host.split('.').some(label => !label) || /\.(?:localhost|local|internal|test|invalid|example)$/.test(host)) return true;
  if (host.includes(':')) return true; // No literal IPv6 or IPv4-mapped host probes.
  if (/^\d+(?:\.\d+){3}$/.test(host)) return true;
  return false;
}

function webUrl(value, image) {
  if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)) return '';
  try {
    const url = new URL(value);
    if (!(image ? url.protocol === 'https:' : ['https:','http:'].includes(url.protocol)) || url.username || url.password || blockedHost(url.hostname,image)) return '';
    return url.href;
  } catch { return ''; }
}

export function normalizeMailCid(value) {
  if (typeof value !== 'string' || value.length > 500) return '';
  let id = value.trim().replace(/^cid:/i, '');
  try { id = decodeURIComponent(id); } catch { return ''; }
  if (id.startsWith('<') && id.endsWith('>')) id = id.slice(1, -1);
  return id && id.length <= 200 && !/[\x00-\x20\x7f<>"']/.test(id) ? id.toLowerCase() : '';
}

function imageDimensions(bytes, type) {
  if (type === 'image/png' && bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if (type === 'image/gif' && bytes.length >= 10 && ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))) return [bytes.readUInt16LE(6),bytes.readUInt16LE(8)];
  if (type === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) return [bytes.readUInt16BE(offset + 5),bytes.readUInt16BE(offset + 3)];
      offset += length;
    }
  }
  if (type === 'image/webp' && bytes.length >= 20 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunk = bytes.toString('ascii',offset,offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (length > bytes.length - start) break;
      if (chunk === 'VP8X' && length >= 10) return [bytes.readUIntLE(start + 4,3) + 1,bytes.readUIntLE(start + 7,3) + 1];
      if (chunk === 'VP8L' && length >= 5 && bytes[start] === 47) { const bits = bytes.readUInt32LE(start + 1); return [(bits & 16383) + 1,((bits >>> 14) & 16383) + 1]; }
      if (chunk === 'VP8 ' && length >= 10 && bytes.subarray(start + 3,start + 6).equals(Buffer.from([157,1,42]))) return [bytes.readUInt16LE(start + 6) & 16383,bytes.readUInt16LE(start + 8) & 16383];
      offset = start + length + (length % 2);
    }
  }
  return null;
}

export function mailInlineImageData(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !RASTER_TYPES.has(type) || bytes.length > MAIL_HTML_LIMITS.inlineImageBytes) return '';
  const dimensions = imageDimensions(bytes,type);
  if (!dimensions || dimensions.some(size => size < 1 || size > MAIL_HTML_LIMITS.imageDimension)) return '';
  return `data:${type};base64,${bytes.toString('base64')}`;
}

function imageSource(value, inlineImages) {
  if (typeof value !== 'string') return '';
  if (/^cid:/i.test(value)) return imageSource(inlineImages?.get(normalizeMailCid(value)), undefined);
  if (value.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length > Math.ceil(MAIL_HTML_LIMITS.inlineImageBytes / 3) * 4 || match[2].length % 4) return '';
    const bytes = Buffer.from(match[2],'base64');
    return bytes.toString('base64') === match[2] ? mailInlineImageData(bytes,match[1]) : '';
  }
  return webUrl(value,true);
}

function safeStyle(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\\@\x00-\x1f\x7f]|\/\*|(?:url|expression|var|image-set|attr)\s*\(|behavior|binding/i.test(value)) return '';
  return value;
}

function srcset(value) {
  if (typeof value !== 'string' || value.length > 8192) return '';
  const entries = value.split(',');
  if (entries.length > 8) return '';
  const safe = [];
  for (const entry of entries) {
    const match = /^(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?$/.exec(entry.trim());
    if (!match) return '';
    const url = webUrl(match[1],true);
    if (!url || match[2] && (+match[2] <= 0 || +match[2] > (match[3] === 'x' ? 8 : 4096))) return '';
    safe.push(url + (match[2] ? ` ${match[2]}${match[3]}` : ''));
  }
  return safe.join(', ');
}

export function mailHtmlCidReferences(value) {
  if (!boundedHtml(value)) return [];
  const ids = new Set();
  sanitizeHtml(value,{ allowedTags:['img'],allowedAttributes:{img:['src']},transformTags:{img:(tagName,attribs)=>{
    if (/^cid:/i.test(attribs.src || '')) { const id = normalizeMailCid(attribs.src); if (id && ids.size < MAIL_HTML_LIMITS.inlineImages) ids.add(id); }
    return {tagName,attribs:{}};
  }},nonTextTags:NO_CONTENT,allowProtocolRelative:false,nestingLimit:64 });
  return [...ids];
}

export function sanitizeMailHtml(value, { inlineImages } = {}) {
  if (!boundedHtml(value)) return { html:'',hasHtml:false,htmlTruncated:Boolean(value) };
  let images = 0, contentTruncated = false;
  const html = sanitizeHtml(value,{
    allowedTags:TAGS,nonTextTags:NO_CONTENT,disallowedTagsMode:'discard',allowProtocolRelative:false,nestingLimit:64,
    allowedSchemes:['https','http','data'],allowedSchemesByTag:{img:['https','data'],a:['https','http']},
    allowedAttributes:{'*':['style','dir','lang'],a:['href','title','target','rel'],img:['src','srcset','alt','title','width','height','loading','decoding','referrerpolicy'],
      table:['width','height','border','cellpadding','cellspacing','align','bgcolor','role'],td:['colspan','rowspan','width','height','align','valign','bgcolor'],th:['colspan','rowspan','width','height','align','valign','scope','bgcolor'],
      col:['span','width'],colgroup:['span','width'],ol:['start','type'],li:['value']},
    allowedStyles:{'*':STYLES},parseStyleAttributes:true,
    transformTags:{'*':(tagName,input)=>{
      const attribs={...input};
      if (attribs.style) attribs.style=safeStyle(attribs.style);
      if (attribs.dir && !/^(?:ltr|rtl|auto)$/i.test(attribs.dir)) delete attribs.dir;
      if (attribs.lang && !/^[a-z0-9-]{1,35}$/i.test(attribs.lang)) delete attribs.lang;
      if (attribs.bgcolor && !COLOR.test(attribs.bgcolor)) delete attribs.bgcolor;
      for (const name of ['width','height','border','cellpadding','cellspacing','colspan','rowspan','span']) if (attribs[name] && !/^\d{1,4}%?$/.test(attribs[name])) delete attribs[name];
      if (tagName==='a') { const href=webUrl(attribs.href,false);if(href)attribs.href=href;else delete attribs.href;attribs.target='_blank';attribs.rel='noopener noreferrer'; }
      if (tagName==='img') {
        const src=++images <= MAIL_HTML_LIMITS.images ? imageSource(attribs.src,inlineImages) : '';
        if (images > MAIL_HTML_LIMITS.images || /^cid:/i.test(attribs.src || '') && !src) contentTruncated = true;
        if(src)attribs.src=src;else delete attribs.src;
        const set=images <= MAIL_HTML_LIMITS.images ? srcset(attribs.srcset) : '';
        if(set)attribs.srcset=set;else delete attribs.srcset;
        attribs.loading='lazy';attribs.decoding='async';attribs.referrerpolicy='no-referrer';
        attribs.style=(attribs.style || '')+';max-width:100%;height:auto';
      }
      return {tagName,attribs};
    }}
  });
  if (Buffer.byteLength(html) > MAIL_HTML_LIMITS.outputBytes) return {html:'',hasHtml:false,htmlTruncated:true};
  return {html,hasHtml:Boolean(html.trim()),htmlTruncated:contentTruncated};
}
