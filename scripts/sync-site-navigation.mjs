/* Generate real HTML links before publication. Runtime scrolling never replaces
   these links, so role checks and no-JavaScript navigation remain reliable. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SITE_NAVIGATION_ITEMS,SITE_NAVIGATION_COPY,SITE_NAVIGATION_ORIGIN} from '../assets/site-navigation-catalog.js';

const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SITE_NAVIGATION_PAGES=Object.freeze([
  ['index.html','home'],['account/index.html','account'],['settings/index.html','settings'],['help/index.html','help'],
  ['support/index.html','support'],['privacy/index.html','privacy'],['about/index.html','about'],['admin/index.html','admin'],
  ['mail/index.html','mail'],['membership/index.html','membership'],['community/index.html','community'],['profile/index.html','profile'],['messages/index.html','messages']
].map(entry=>Object.freeze(entry)));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const icons=body=>`<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const OPEN='<!-- site-navigation:start -->',CLOSE='<!-- site-navigation:end -->';
const GENERATED=/<!-- site-navigation:start -->[\s\S]*?<!-- site-navigation:end -->/;
const LEGACY=/<nav\b[^>]*class=(?:"[^"]*\b(?:home-rail|page-nav)\b[^"]*"|'[^']*\b(?:home-rail|page-nav)\b[^']*')[^>]*>[\s\S]*?<\/nav>/;

export function renderSiteNavigation({current='home',home=current==='home',language='th'}={}){
  const lang=language==='en'?'en':'th',copy=SITE_NAVIGATION_COPY[lang],prefix='site-nav',scroller=prefix+'-items';
  const control=(direction,shape)=>`<button type="button" class="site-nav-scroll-control site-nav-${direction==='previous'?'prev':'next'}" data-nav-${direction} aria-controls="${scroller}" aria-label="${escape(copy[direction])}" hidden>${icons(shape)}<span class="site-nav-control-label" data-th="${escape(SITE_NAVIGATION_COPY.th[direction])}" data-en="${escape(SITE_NAVIGATION_COPY.en[direction])}">${escape(copy[direction])}</span></button>`;
  const links=SITE_NAVIGATION_ITEMS.map(item=>`<a href="${SITE_NAVIGATION_ORIGIN+item.path}" data-navigation-item="${item.id}" aria-labelledby="${prefix}-${item.id}-label"${item.access?` data-${item.access}-access hidden`:''}${current===item.id?' aria-current="page"':''}>${icons(item.icon)}<span id="${prefix}-${item.id}-label" class="site-nav-label soft-nav-label" data-th="${escape(item.th)}" data-en="${escape(item.en)}">${escape(item[lang])}</span></a>`).join('');
  return `${OPEN}<nav class="${home?'home-rail':'page-nav'} site-navigation" data-site-navigation aria-label="Taithai">${control('previous','<path d="m6 15 6-6 6 6"/>')}<div class="site-nav-scroll" data-nav-scroller id="${scroller}" tabindex="0" aria-label="${escape(copy.menu)}">${links}</div>${control('next','<path d="m6 9 6 6 6-6"/>')}</nav>${CLOSE}`;
}
function includeScript(html,source){
  const present=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].some(match=>match[1].split('?')[0]===source);
  return present?html:html.replace('</head>',`<script type="module" src="${source}"></script></head>`);
}
export function renderNavigationDocument(html,{current='home',home=current==='home'}={}){
  const language=/<html\b[^>]*\blang=["']en["']/i.test(html)?'en':'th',rendered=renderSiteNavigation({current,home,language});
  const matcher=GENERATED.test(html)?GENERATED:LEGACY;
  if(!matcher.test(html))throw Error('PRIMARY_NAVIGATION_NOT_FOUND:'+current);
  let next=html.replace(matcher,rendered);
  if(home){
    next=next.replace(/<details\b[^>]*class=["'][^"']*\bportal-menu\b[^"']*["'][^>]*>[\s\S]*?<\/details>/,'');
    next=next.split('\n').filter(line=>!(line.includes("document.addEventListener('keydown'")&&line.includes("document.querySelector('.portal-menu')"))&&!(line.includes("document.addEventListener('click'")&&line.includes("document.querySelector('.portal-menu')"))).join('\n').replace(/^[\t ]+$/gm,'');
  }
  for(const source of ['/assets/site-owner-ui.js','/assets/site-access-ui.js','/assets/site-navigation.js'])next=includeScript(next,source);
  // This override must follow the original home/service navigation styles.
  next=next.replace(/<link\b[^>]*href=["']\/assets\/site-navigation\.css(?:\?[^"']*)?["'][^>]*>/g,'');
  next=next.replace('</head>','<link rel="stylesheet" href="/assets/site-navigation.css"></head>');
  return next;
}
export async function syncSiteNavigation({root=DEFAULT_ROOT,check=false}={}){
  const changed=[],present=[];
  for(const [relative,current]of SITE_NAVIGATION_PAGES){
    const filename=path.join(root,relative);let before;
    try{before=await readFile(filename,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
    present.push(relative);const after=renderNavigationDocument(before,{current});
    if(after!==before){changed.push(relative);if(!check)await writeFile(filename,after);}
  }
  if(check&&changed.length)throw Error('Navigation HTML is out of date: '+changed.join(', '));
  return {pages:present,changed};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await syncSiteNavigation({check:process.argv.includes('--check')});
  console.log(`Shared navigation ${process.argv.includes('--check')?'verified':'synced'} across ${result.pages.length} pages${result.changed.length?` (${result.changed.length} updated)`:''}`);
}
