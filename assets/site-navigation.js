/* Enhance the generated navigation with scrolling only. Links and access
   markers stay intact; site-access-ui remains the sole role visibility owner. */
import {SITE_NAVIGATION_COPY} from './site-navigation-catalog.js';

const visible=node=>Boolean(node&&!node.hidden&&node.getAttribute?.('aria-hidden')!=='true');
const number=value=>Number.isFinite(Number(value))?Number(value):0;
export function navigationScrollState(scroller,axis='vertical'){
  const horizontal=axis==='horizontal',size=number(horizontal?scroller.clientWidth:scroller.clientHeight);
  const extent=Math.max(0,number(horizontal?scroller.scrollWidth:scroller.scrollHeight)-size);
  const position=Math.max(0,Math.min(extent,number(horizontal?scroller.scrollLeft:scroller.scrollTop)));
  return {size,extent,position,previous:extent>2&&position>2,next:extent>2&&position<extent-2};
}
export function createNavigationController({nav,window:win=globalThis.window,document:doc=win?.document}={}){
  const scroller=nav?.querySelector?.('[data-nav-scroller]'),previous=nav?.querySelector?.('[data-nav-previous]'),next=nav?.querySelector?.('[data-nav-next]');
  if(!win||!doc||!nav||!scroller||!previous||!next||nav.dataset.navigationInitialized)return null;
  nav.dataset.navigationInitialized='true';
  let disposed=false,suspended=false,generation=0,frame=null,resizeObserver=null,mutationObserver=null,pendingCurrent=true,pendingFocus=null,lastHeight='',axis='vertical',linkVisibility=new WeakMap();
  const listeners=[];
  const language=()=>win.TaithaiPreferences?.get?.().language==='en'||!win.TaithaiPreferences&&doc.documentElement.lang==='en'?'en':'th';
  const style=node=>win.getComputedStyle?.(node)||{};
  const currentLink=()=>scroller.querySelector('[aria-current="page"]');
  const reduce=()=>doc.documentElement.dataset?.motion==='reduce'||win.TaithaiPreferences?.get?.().motion==='reduce'||win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const requestFrame=callback=>win.requestAnimationFrame?win.requestAnimationFrame(callback):win.setTimeout(callback,16);
  const cancelFrame=value=>win.cancelAnimationFrame?win.cancelAnimationFrame(value):win.clearTimeout(value);
  function listen(target,type,callback,options){if(!target?.addEventListener)return;target.addEventListener(type,callback,options);listeners.push(()=>target.removeEventListener(type,callback,options));}
  function scrollBy(delta,behavior='auto'){
    if(!Number.isFinite(delta)||Math.abs(delta)<1)return;
    const values=axis==='horizontal'?{left:delta,top:0,behavior}:{left:0,top:delta,behavior};
    if(typeof scroller.scrollBy==='function')scroller.scrollBy(values);
    else if(axis==='horizontal')scroller.scrollLeft+=delta;else scroller.scrollTop+=delta;
  }
  function reveal(link){
    if(!visible(link)||!scroller.contains(link))return;
    const viewport=scroller.getBoundingClientRect(),target=link.getBoundingClientRect();
    const start=axis==='horizontal'?'left':'top',end=axis==='horizontal'?'right':'bottom';
    // Scroll this menu, never the page or another ancestor, and never focus a
    // link just because a page loaded or an account permission was confirmed.
    const delta=target[start]<viewport[start]+4?target[start]-viewport[start]-4:target[end]>viewport[end]-4?target[end]-viewport[end]+4:0;
    scrollBy(delta);
  }
  function showControl(button,show){
    button.hidden=!show;button.disabled=!show;
    // A keyboard-activated end button can disappear after its scroll. Preserve
    // keyboard context in the menu instead of dropping focus onto the page.
    if(!show&&doc.activeElement===button)scroller.focus?.({preventScroll:true});
  }
  function update(){
    frame=null;if(disposed||suspended)return;
    const text=SITE_NAVIGATION_COPY[language()],rect=nav.getBoundingClientRect(),computedTop=parseFloat(style(nav).top)||0;
    const visual=win.visualViewport,bottom=visual?Math.min(win.innerHeight,visual.height+(visual.offsetTop||0)):win.innerHeight;
    const height=Math.max(144,Math.floor((bottom||768)-Math.max(rect.top,computedTop)-16))+'px';
    if(lastHeight!==height){nav.style.setProperty('--site-nav-available-height',height);lastHeight=height;}
    axis=String(style(scroller).flexDirection||'column').startsWith('row')?'horizontal':'vertical';
    if(nav.dataset.navAxis!==axis)nav.dataset.navAxis=axis;
    scroller.setAttribute('aria-label',text.menu);
    for(const [button,key]of [[previous,'previous'],[next,'next']]){
      button.setAttribute('aria-label',text[key]);const label=button.querySelector('.site-nav-control-label');if(label)label.textContent=text[key];
    }
    const focus=pendingFocus;pendingFocus=null;
    if(focus)reveal(focus);
    else if(pendingCurrent&&visible(currentLink())){pendingCurrent=false;reveal(currentLink());}
    const state=navigationScrollState(scroller,axis);showControl(previous,state.previous);showControl(next,state.next);
    const overflow=String(state.extent>2);if(nav.dataset.navOverflow!==overflow)nav.dataset.navOverflow=overflow;
  }
  function schedule(){if(disposed||suspended||frame!==null)return;frame=requestFrame(update);}
  function move(direction){
    if(disposed||suspended)return;const size=navigationScrollState(scroller,axis).size;
    scrollBy(direction*Math.max(48,Math.floor(size*.75)),reduce()?'auto':'smooth');schedule();
  }
  const onPrevious=()=>move(-1),onNext=()=>move(1);
  const onFocus=event=>{const link=event.target?.closest?.('a[data-navigation-item]');if(link&&scroller.contains(link)){pendingFocus=link;schedule();}};
  const onKey=event=>{if(event.target!==scroller||event.altKey||event.ctrlKey||event.metaKey||!['PageDown','PageUp'].includes(event.key))return;event.preventDefault();move(event.key==='PageDown'?1:-1);};
  function connect(){
    if(disposed)return;suspended=false;const currentGeneration=++generation;
    linkVisibility=new WeakMap();for(const link of scroller.querySelectorAll('a[data-navigation-item]'))linkVisibility.set(link,visible(link));
    if(typeof win.ResizeObserver==='function'){resizeObserver=new win.ResizeObserver(()=>{if(currentGeneration===generation)schedule();});resizeObserver.observe(nav);resizeObserver.observe(scroller);}
    if(typeof win.MutationObserver==='function'){
      mutationObserver=new win.MutationObserver(records=>{
        if(disposed||suspended||currentGeneration!==generation)return;
        // Ignore our own control labels, hidden end buttons and height styles.
        // Only existing catalog links can trigger role/current re-evaluation.
        let changed=false;
        for(const record of records){
          const link=record.target;if(!link?.matches?.('a[data-navigation-item]'))continue;
          if(record.attributeName==='aria-current'){pendingCurrent=true;changed=true;}
          else if(record.attributeName==='hidden'){
            const after=visible(link),before=linkVisibility.get(link);linkVisibility.set(link,after);
            if(before!==after){changed=true;if(after)pendingCurrent=true;}
          }
        }
        if(changed)schedule();
      });
      mutationObserver.observe(scroller,{subtree:true,attributes:true,attributeFilter:['hidden','aria-current']});
    }
    listen(scroller,'scroll',schedule,{passive:true});listen(scroller,'focusin',onFocus);listen(scroller,'keydown',onKey);listen(previous,'click',onPrevious);listen(next,'click',onNext);
    listen(win,'resize',schedule,{passive:true});listen(win,'scroll',schedule,{passive:true});listen(win,'orientationchange',schedule,{passive:true});listen(win,'taithai:preferences',schedule);
    listen(win.visualViewport,'resize',schedule,{passive:true});listen(win.visualViewport,'scroll',schedule,{passive:true});
    pendingCurrent=true;schedule();
  }
  function disconnect(){suspended=true;generation++;if(frame!==null)cancelFrame(frame);frame=null;resizeObserver?.disconnect();mutationObserver?.disconnect();resizeObserver=mutationObserver=null;for(const remove of listeners.splice(0))remove();pendingFocus=null;}
  const onHide=()=>disconnect(),onShow=event=>{if(event.persisted&&!disposed&&suspended)connect();};
  win.addEventListener('pagehide',onHide);win.addEventListener('pageshow',onShow);connect();
  return {refresh:schedule,destroy(){disposed=true;disconnect();win.removeEventListener('pagehide',onHide);win.removeEventListener('pageshow',onShow);delete nav.dataset.navigationInitialized;}};
}
export function initSiteNavigation({window:win=globalThis.window,document:doc=win?.document}={}){
  if(!win||!doc)return null;const controls=[...doc.querySelectorAll('[data-site-navigation]')].map(nav=>createNavigationController({nav,window:win,document:doc})).filter(Boolean);
  return {refresh(){for(const control of controls)control.refresh();},destroy(){for(const control of controls)control.destroy();}};
}
if(typeof window!=='undefined')initSiteNavigation();
