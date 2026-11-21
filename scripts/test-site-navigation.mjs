import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {SITE_NAVIGATION_ITEMS,SITE_NAVIGATION_ORIGIN} from '../assets/site-navigation-catalog.js';
import {SITE_NAVIGATION_PAGES,renderNavigationDocument,syncSiteNavigation} from './sync-site-navigation.mjs';
import {navigationScrollState,createNavigationController} from '../assets/site-navigation.js';

class Events{
  events=new Map();addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}removeEventListener(name,fn){this.events.get(name)?.delete(fn);}fire(name,event={}){for(const fn of this.events.get(name)||[])fn({target:this,preventDefault(){this.prevented=true;},...event});}
}
class Element extends Events{
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.dataset={};this.attributes={};this.children=[];this.hidden=false;this.disabled=false;this.style={values:{},setProperty:(key,value)=>{this.style.values[key]=value;this.style.writes=(this.style.writes||0)+1;}};}
  append(...children){for(const child of children){this.children.push(child);child.parent=this;}}
  all(){return [this,...this.children.flatMap(child=>child.all())];}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part));if(selector==='[hidden]')return this.hidden;if(selector==='[inert]')return 'inert'in this.attributes;if(selector==='[aria-hidden="true"]')return this.attributes['aria-hidden']==='true';if(selector==='a[data-navigation-item]')return this.tagName==='A'&&typeof this.dataset.navigationItem==='string';if(selector==='[aria-current="page"]')return this.attributes['aria-current']==='page';if(selector.startsWith('.'))return this.className?.split(' ').includes(selector.slice(1));const properties={'[data-nav-scroller]':'navScroller','[data-nav-previous]':'navPrevious','[data-nav-next]':'navNext','[data-nav-toggle]':'navToggle','[data-nav-tooltip]':'navTooltip'};return properties[selector]?properties[selector]in this.dataset:false;}
  querySelector(selector){return this.all().slice(1).find(node=>node.matches(selector))||null;}
  querySelectorAll(selector){return this.all().slice(1).filter(node=>node.matches(selector));}
  closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
  setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];}
  getBoundingClientRect(){return {top:0,left:0,right:160,bottom:40,width:160,height:40};}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  animate(frames,options){const animation={frames,options,cancel(){this.cancelled=true;this.oncancel?.();}};this.doc.animations.push(animation);return animation;}
  focus(){this.doc.activeElement=this;this.doc.focusCalls.push(this);}
}
function fixture({axis='vertical',current='home',viewport=768,scrollerSize=216}={}){
  const doc=Object.assign(new Events(),{documentElement:{lang:'en',dataset:{}},activeElement:null,focusCalls:[],animations:[]}),win=new Events(),frames=new Map();let nextFrame=0;
  doc.createElement=tag=>new Element(tag,doc);doc.body=doc.createElement('body');doc.querySelector=selector=>doc.body.querySelector(selector);
  win.innerHeight=viewport;win.innerWidth=1024;win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;win.localStorage={values:new Map(),getItem(key){return this.values.get(key)||null;},setItem(key,value){this.values.set(key,value);}};win.visualViewport=new Events();win.visualViewport.height=viewport;win.visualViewport.offsetTop=0;win.TaithaiPreferences={get:()=>({language:doc.documentElement.lang,reduceMotion:doc.documentElement.dataset.motion})};const motionQuery=Object.assign(new Events(),{matches:false});win.matchMedia=()=>motionQuery;
  win.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};win.cancelAnimationFrame=id=>frames.delete(id);
  const nav=new Element('nav',doc),scroll=new Element('div',doc),previous=new Element('button',doc),next=new Element('button',doc),toggle=new Element('button',doc);toggle.dataset.navToggle='';const toggleLabel=new Element('span',doc);toggleLabel.className='site-nav-toggle-label';toggle.append(toggleLabel);
  nav.dataset.siteNavigation='';scroll.dataset.navScroller='';previous.dataset.navPrevious='';next.dataset.navNext='';previous.hidden=next.hidden=true;
  for(const button of [previous,next]){const label=new Element('span',doc);label.className='site-nav-control-label';button.append(label);}
  nav.append(toggle,previous,scroll,next);doc.body.append(nav);nav.top=40;nav.getBoundingClientRect=()=>({top:nav.top,bottom:nav.top+500,left:24,right:120});
  scroll.axis=axis;scroll.size=scrollerSize;scroll.scrollTop=scroll.scrollLeft=0;
  Object.defineProperties(scroll,{clientWidth:{get:()=>scroll.axis==='horizontal'?scroll.size:96},clientHeight:{get:()=>scroll.axis==='vertical'?scroll.size:96},scrollWidth:{get:()=>scroll.axis==='horizontal'?scroll.children.filter(link=>!link.hidden).length*80:96},scrollHeight:{get:()=>scroll.axis==='vertical'?scroll.children.filter(link=>!link.hidden).length*80:96}});
  scroll.getBoundingClientRect=()=>({top:100,left:24,right:24+scroll.clientWidth,bottom:100+scroll.clientHeight});
  scroll.moves=[];scroll.scrollBy=options=>{scroll.moves.push(options);const horizontal=scroll.axis==='horizontal',extent=(horizontal?scroll.scrollWidth-scroll.clientWidth:scroll.scrollHeight-scroll.clientHeight);const key=horizontal?'scrollLeft':'scrollTop',delta=horizontal?options.left:options.top;scroll[key]=Math.max(0,Math.min(extent,scroll[key]+delta));scroll.fire('scroll');};
  const links=Object.fromEntries(SITE_NAVIGATION_ITEMS.map(item=>{const link=new Element('a',doc);link.dataset.navigationItem=item.id;link.hidden=Boolean(item.access);if(current===item.id)link.setAttribute('aria-current','page');if(item.access)link.setAttribute('data-'+item.access+'-access','');scroll.append(link);link.getBoundingClientRect=()=>{const index=scroll.children.filter(node=>!node.hidden).indexOf(link),box=scroll.getBoundingClientRect();return scroll.axis==='horizontal'?{left:box.left+index*80-scroll.scrollLeft,right:box.left+(index+1)*80-scroll.scrollLeft,top:box.top,bottom:box.bottom}:{top:box.top+index*80-scroll.scrollTop,bottom:box.top+(index+1)*80-scroll.scrollTop,left:box.left,right:box.right};};const icon=new Element('svg',doc);icon.className='nav-icon';icon.getBoundingClientRect=()=>{const rect=link.getBoundingClientRect();return {...rect,left:rect.left+(doc.documentElement.dataset.navigationExpanded==='true'?8:28)};};const label=new Element('span',doc);label.className='site-nav-label';label.dataset.en=item.en;label.dataset.th=item.th;label.textContent=item.en;link.append(icon,label);return [item.id,link];}));
  win.getComputedStyle=node=>node===scroll?{flexDirection:scroll.axis==='horizontal'?'row':'column'}:{top:'24px'};
  const observers={resize:[],mutation:[]};
  win.ResizeObserver=class{constructor(callback){this.callback=callback;observers.resize.push(this);}observe(){}disconnect(){this.closed=true;}};
  win.MutationObserver=class{constructor(callback){this.callback=callback;observers.mutation.push(this);}observe(_,options){this.options=options;}disconnect(){this.closed=true;}};
  const controller=createNavigationController({nav,window:win,document:doc});
  function flush(){for(let iteration=0;frames.size;iteration++){if(iteration>20)throw Error('Navigation observer feedback loop');const jobs=[...frames.values()];frames.clear();for(const fn of jobs)fn();}}
  const mutation=(target,attributeName='hidden')=>observers.mutation.find(observer=>!observer.closed&&observer.options?.attributeFilter.includes('hidden')).callback([{target,attributeName}]);
  flush();return {nav,scroll,previous,next,toggle,links,win,doc,controller,flush,frames,mutation,observers,motionQuery};
}

test('every primary page contains the same complete canonical menu before JavaScript and hides only protected entries',async()=>{
  const expected=['home','mail','community','profile','messages','account','settings','admin','help','support','privacy','about'];
  assert.deepEqual(SITE_NAVIGATION_ITEMS.map(item=>item.id),expected);
  let present=0;
  for(const [filename,current]of SITE_NAVIGATION_PAGES){
    let html;try{html=await readFile(new URL('../'+filename,import.meta.url),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}present++;
    const nav=html.match(/<!-- site-navigation:start -->([\s\S]*?)<!-- site-navigation:end -->/)?.[1];assert.ok(nav,filename);
    const links=[...nav.matchAll(/<a\b([^>]+)>/g)];assert.deepEqual(links.map(link=>link[1].match(/data-navigation-item="([^"]+)"/)[1]),expected,filename);
    for(const [index,match]of links.entries()){
      const item=SITE_NAVIGATION_ITEMS[index],attributes=match[1];assert.ok(attributes.includes(`href="${SITE_NAVIGATION_ORIGIN+item.path}"`),filename+':'+item.id);
      assert.equal(/\shidden(?:\s|$)/.test(attributes),Boolean(item.access),filename+':'+item.id);
      assert.equal(attributes.includes('aria-current="page"'),item.id===current,filename+':'+item.id);
      if(item.access)assert.ok(attributes.includes('data-'+item.access+'-access'),filename+':'+item.id);
    }
    const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length,filename+': IDs must be unique');
    for(const source of ['site-owner-ui.js','site-access-ui.js','site-navigation.js'])assert.equal((html.match(new RegExp('src="/assets/'+source.replace('.','\\.')+'"','g'))||[]).length,1,filename+':'+source);
    assert.equal(renderNavigationDocument(html,{current}),html,filename+': generation must be idempotent');
  }
  assert.ok(present>=11,'both hosting checkouts must cover the 11 shared primary pages');
  const home=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(home,/<details[^>]*class="portal-menu"/);assert.doesNotMatch(home,/document\.querySelector\('\.portal-menu'\)/);
});

test('build synchronization updates existing checkouts without requiring optional service pages',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'taithai-navigation-'));
  try{
    await mkdir(path.join(root,'account'));const fixture='<html lang="th"><head></head><body><nav class="page-nav"><a href="/">old</a></nav></body></html>';
    await writeFile(path.join(root,'account/index.html'),fixture);await assert.rejects(syncSiteNavigation({root,check:true}),/out of date/);
    assert.deepEqual((await syncSiteNavigation({root})).pages,['account/index.html']);assert.deepEqual((await syncSiteNavigation({root,check:true})).changed,[]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('scroll state tolerates rounding and overscroll without showing false end controls',()=>{
  assert.deepEqual(navigationScrollState({clientHeight:200,scrollHeight:201,scrollTop:-20}),{size:200,extent:1,position:0,previous:false,next:false});
  assert.deepEqual(navigationScrollState({clientWidth:100,scrollWidth:400,scrollLeft:999},'horizontal'),{size:100,extent:300,position:300,previous:true,next:false});
});

test('the active item is revealed once; passive resizes never reset a user’s manual menu position or focus',()=>{
  const site=fixture({current:'about'});assert.ok(site.scroll.scrollTop>0);assert.equal(site.next.hidden,true);assert.equal(site.doc.focusCalls.length,0);
  site.scroll.scrollTop=0;site.scroll.moves=[];site.win.fire('resize');site.observers.resize[0].callback();site.flush();
  assert.equal(site.scroll.scrollTop,0);assert.equal(site.scroll.moves.length,0);assert.equal(site.next.hidden,false);assert.equal(site.nav.style.values['--site-nav-available-height'],'712px');assert.equal(site.nav.style.writes,1);site.controller.destroy();
});

test('hidden role links stay hidden until another controller confirms access, then the active link becomes reachable',()=>{
  const site=fixture({current:'admin'});assert.equal(site.links.mail.hidden,true);assert.equal(site.links.admin.hidden,true);assert.equal(site.scroll.moves.length,0);
  site.links.mail.hidden=false;site.links.admin.hidden=false;site.mutation(site.links.admin);site.flush();assert.ok(site.scroll.scrollTop>0);
  const box=site.scroll.getBoundingClientRect(),current=site.links.admin.getBoundingClientRect();assert.ok(current.top>=box.top&&current.bottom<=box.bottom);
  assert.equal(site.doc.focusCalls.length,0);assert.equal(site.links.mail.hidden,false);site.links.mail.hidden=true;site.links.admin.hidden=true;site.mutation(site.links.mail);site.flush();assert.equal(site.links.mail.hidden,true);assert.equal(site.links.admin.hidden,true);site.controller.destroy();
});

test('redundant role hidden writes recheck no geometry and never reset a manually scrolled menu',()=>{
  const site=fixture({current:'about'});site.scroll.scrollTop=0;site.scroll.moves=[];
  site.mutation(site.links.mail);site.mutation(site.links.admin);site.flush();assert.equal(site.scroll.scrollTop,0);assert.equal(site.scroll.moves.length,0);
  site.links.mail.hidden=false;site.mutation(site.links.mail);site.flush();assert.ok(site.scroll.scrollTop>0,'a newly visible authorized item can move the active item into view once');
  site.scroll.scrollTop=0;site.scroll.moves=[];site.mutation(site.links.mail);site.flush();assert.equal(site.scroll.scrollTop,0);assert.equal(site.scroll.moves.length,0);site.controller.destroy();
});

test('horizontal menus use their actual CSS axis and buttons scroll 75% with reduced-motion feedback',()=>{
  const site=fixture({axis:'horizontal',current:'home',scrollerSize:320});assert.equal(site.nav.dataset.navAxis,'horizontal');assert.equal(site.previous.hidden,true);assert.equal(site.next.hidden,false);
  site.next.fire('click');site.flush();assert.equal(site.scroll.moves.at(-1).left,240);assert.equal(site.scroll.moves.at(-1).behavior,'smooth');assert.equal(site.previous.hidden,false);
  site.doc.documentElement.dataset.motion='reduce';site.previous.fire('click');site.flush();assert.equal(site.scroll.moves.at(-1).left,-240);assert.equal(site.scroll.moves.at(-1).behavior,'auto');assert.equal(site.previous.hidden,true);site.controller.destroy();
});

test('focus reveal scrolls only the menu and PageDown works from the explicit scroll area',()=>{
  const site=fixture({current:'home'});site.links.about.focus();site.scroll.fire('focusin',{target:site.links.about});site.flush();assert.equal(site.doc.activeElement,site.links.about);assert.equal(site.doc.focusCalls.length,1);assert.ok(site.scroll.scrollTop>0);
  site.scroll.scrollTop=0;site.scroll.moves=[];site.scroll.fire('keydown',{target:site.scroll,key:'PageDown'});site.flush();assert.equal(site.scroll.moves[0].top,162);assert.equal(site.doc.activeElement,site.links.about);site.controller.destroy();
});

test('end button disappearance preserves keyboard context in the scroll area',()=>{
  const site=fixture({axis:'horizontal',scrollerSize:320});site.next.focus();site.scroll.scrollLeft=site.scroll.scrollWidth-site.scroll.clientWidth;site.scroll.fire('scroll');site.flush();assert.equal(site.next.hidden,true);assert.equal(site.doc.activeElement,site.scroll);site.controller.destroy();
});

test('BFCache disconnects observers and rejects late callbacks while restoring labels and role-sensitive state',()=>{
  const site=fixture(),old=site.observers.mutation[0];site.win.fire('pagehide');assert.equal(old.closed,true);assert.equal(site.frames.size,0);
  site.win.fire('pageshow',{persisted:true});site.flush();site.scroll.moves=[];old.callback([{target:site.links.admin,attributeName:'hidden'}]);site.flush();assert.equal(site.scroll.moves.length,0);
  site.doc.documentElement.lang='th';site.win.fire('taithai:preferences');site.flush();assert.equal(site.next.attributes['aria-label'],'เลื่อนเมนูถัดไป');assert.equal(site.links.mail.hidden,true);site.controller.destroy();assert.equal(site.nav.dataset.navigationInitialized,undefined);
});

test('appearance bootstrap defaults to icons and restores only the saved appearance before CSS',async()=>{
  const source=await readFile(new URL('../assets/site-navigation-state.js',import.meta.url),'utf8');
  for(const [saved,expected]of [[null,'false'],['1','true'],['0','false']]){const values={};runInNewContext(source,{window:{localStorage:{getItem:()=>saved}},document:{documentElement:{setAttribute:(key,value)=>values[key]=value}}});assert.equal(values['data-navigation-expanded'],expected);}
  const values={};runInNewContext(source,{window:{get localStorage(){throw Error('BLOCKED');}},document:{documentElement:{setAttribute:(key,value)=>values[key]=value}}});assert.equal(values['data-navigation-expanded'],'false');
  const html=await readFile(new URL('../community/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('site-navigation-state.js')<html.indexOf('rel="stylesheet"'));assert.match(html,/<html[^>]*data-navigation-expanded="false"/);
});

test('toggle state persists, storage events synchronize it and unavailable storage never disables expansion',()=>{
  const site=fixture();assert.equal(site.toggle.attributes['aria-expanded'],'false');site.toggle.fire('click');site.flush();assert.equal(site.doc.documentElement.dataset.navigationExpanded,'true');assert.equal(site.toggle.attributes['aria-label'],'Collapse menu');assert.equal(site.win.localStorage.values.get('taithai.navigation.expanded.v1'),'1');
  site.win.fire('storage',{key:'taithai.navigation.expanded.v1',newValue:'0'});site.flush();assert.equal(site.toggle.attributes['aria-expanded'],'false');
  site.win.localStorage.setItem=()=>{throw Error('BLOCKED');};site.toggle.fire('click');site.flush();assert.equal(site.toggle.attributes['aria-expanded'],'true');site.controller.destroy();site.controller.setExpanded(false);assert.equal(site.doc.documentElement.dataset.navigationExpanded,'true');
});

test('tooltips are outside the clipped menu, survive late native focus scrolling, dismiss on Escape and disappear on permission loss',async()=>{
  const site=fixture(),link=site.links.profile,tip=site.doc.querySelector('[data-nav-tooltip]');link.focus();site.scroll.fire('focusin',{target:link});site.flush();assert.equal(tip.hidden,false);assert.equal(tip.textContent,'Profile');assert.equal(site.nav.contains(tip),false);assert.equal(link.getAttribute('aria-describedby'),tip.id);
  site.scroll.fire('scroll');site.flush();assert.equal(tip.hidden,true);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(tip.hidden,false,'focused name returns after native focus scroll settles');
  link.fire('pointerleave',{relatedTarget:site.doc.body});await new Promise(resolve=>setTimeout(resolve,240));assert.equal(tip.hidden,false,'moving the pointer away does not dismiss a focused icon name');
  site.doc.fire('keydown',{key:'Escape'});site.scroll.fire('scroll');site.flush();await new Promise(resolve=>setTimeout(resolve,100));assert.equal(tip.hidden,true,'Escape dismissal persists while focus stays on the same icon');
  site.links.home.fire('pointerenter',{pointerType:'mouse'});assert.equal(tip.hidden,false);site.links.home.hidden=true;site.mutation(site.links.home);assert.equal(tip.hidden,true);assert.equal(site.links.home.getAttribute('aria-describedby'),null);site.controller.destroy();
});

test('rapid toggles and live reduced motion cancel existing animation and BFCache removes tooltip content synchronously',()=>{
  const site=fixture();site.toggle.fire('click');site.flush();const old=site.doc.animations.slice();assert.ok(old.length);site.toggle.fire('click');site.flush();assert.ok(old.every(animation=>animation.cancelled));
  site.toggle.fire('click');site.flush();const active=site.doc.animations.filter(animation=>!animation.cancelled);site.doc.documentElement.dataset.motion='reduce';site.win.fire('taithai:preferences');site.flush();assert.ok(active.every(animation=>animation.cancelled));const count=site.doc.animations.length;site.toggle.fire('click');site.flush();assert.equal(site.doc.animations.length,count);
  site.links.home.fire('pointerenter',{pointerType:'mouse'});const tip=site.doc.querySelector('[data-nav-tooltip]');assert.equal(tip.hidden,false);site.win.fire('pagehide');assert.equal(tip.hidden,true);assert.equal(tip.textContent,'');assert.equal(site.links.home.getAttribute('aria-describedby'),null);site.controller.destroy();
});

test('focus leaving the menu before its queued frame cannot reveal an old tooltip or scroll an inactive link',()=>{
  const site=fixture(),link=site.links.about,tip=site.doc.querySelector('[data-nav-tooltip]');link.focus();site.scroll.fire('focusin',{target:link});site.scroll.moves=[];
  site.toggle.focus();site.scroll.fire('focusout',{relatedTarget:site.toggle});site.flush();assert.equal(tip.hidden,true);assert.equal(tip.textContent,'');assert.equal(link.getAttribute('aria-describedby'),null);assert.equal(site.doc.activeElement,site.toggle);assert.equal(site.scroll.moves.length,0);site.controller.destroy();
});
