/* Enhance the generated navigation with scrolling only. Links and access
   markers stay intact; site-access-ui remains the sole role visibility owner. */
import {SITE_NAVIGATION_COPY,SITE_NAVIGATION_STORAGE_KEY} from './site-navigation-catalog.js';

const visible=node=>Boolean(node&&!node.hidden&&node.getAttribute?.('aria-hidden')!=='true');
const number=value=>Number.isFinite(Number(value))?Number(value):0;
export function navigationViewportBounds(win){
  const width=Math.max(1,number(win.innerWidth)||1024),height=Math.max(1,number(win.innerHeight)||768),visual=win.visualViewport;
  const left=Math.max(0,Math.min(width-1,number(visual?.offsetLeft))),top=Math.max(0,Math.min(height-1,number(visual?.offsetTop)));
  const right=Math.max(left+1,Math.min(width,left+(number(visual?.width)>0?number(visual.width):width)));
  const bottom=Math.max(top+1,Math.min(height,top+(number(visual?.height)>0?number(visual.height):height)));
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
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
  let disposed=false,suspended=false,generation=0,frame=null,resizeObserver=null,mutationObserver=null,pendingCurrent=true,pendingFocus=null,lastHeight='',lastBottomSpace='',axis='vertical',linkVisibility=new WeakMap();
  const listeners=[];
  const toggle=nav.querySelector('[data-nav-toggle]'),animations=new Set(),motionQuery=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const expanded=()=>doc.documentElement.dataset.navigationExpanded==='true';
  if(doc.documentElement.dataset.navigationExpanded===undefined)doc.documentElement.dataset.navigationExpanded='false';
  let transitionFrame=null,tipFrame=null,tipTimer=null,tooltipLink=null,tooltip=null,tooltipAnimation=null,rootObserver=null,dismissedLink=null;
  if(doc.createElement&&doc.body){tooltip=doc.querySelector?.('[data-nav-tooltip]')||doc.createElement('div');tooltip.className='site-nav-tooltip';tooltip.dataset.navTooltip='';tooltip.id='site-navigation-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;if(!tooltip.parentNode)doc.body.append(tooltip);}
  const language=()=>win.TaithaiPreferences?.get?.().language==='en'||!win.TaithaiPreferences&&doc.documentElement.lang==='en'?'en':'th';
  const style=node=>win.getComputedStyle?.(node)||{};
  const currentLink=()=>scroller.querySelector('[aria-current="page"]');
  const reduce=()=>doc.documentElement.dataset?.motion==='reduce'||win.TaithaiPreferences?.get?.().reduceMotion==='reduce'||motionQuery?.matches===true;
  const requestFrame=callback=>win.requestAnimationFrame?win.requestAnimationFrame(callback):win.setTimeout(callback,16);
  const cancelFrame=value=>win.cancelAnimationFrame?win.cancelAnimationFrame(value):win.clearTimeout(value);
  function cancelAnimations(){for(const animation of animations)animation.cancel?.();animations.clear();if(transitionFrame!==null)cancelFrame(transitionFrame);transitionFrame=null;}
  function animate(node,frames,options={}){if(reduce()||typeof node?.animate!=='function')return;try{const animation=node.animate(frames,{duration:320,easing:'cubic-bezier(.22,1,.36,1)',...options});animations.add(animation);const done=()=>animations.delete(animation);animation.onfinish=done;animation.oncancel=done;if(animations.size>40)animations.values().next().value.cancel?.();return animation;}catch{/* Motion never blocks navigation. */}}
  function hideTooltip(cancelPending=true){if(tipTimer!==null)win.clearTimeout(tipTimer);tipTimer=null;if(cancelPending&&tipFrame!==null){cancelFrame(tipFrame);tipFrame=null;}if(tooltipLink){const ids=(tooltipLink.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==tooltip?.id);if(ids.length)tooltipLink.setAttribute('aria-describedby',ids.join(' '));else tooltipLink.removeAttribute?.('aria-describedby');}tooltipLink=null;tooltipAnimation?.cancel?.();if(tooltipAnimation)animations.delete(tooltipAnimation);tooltipAnimation=null;if(tooltip){tooltip.hidden=true;tooltip.textContent='';}}
  function exposedLink(link){if(!visible(link)||nav.dataset.keyboardOpen==='true'||link.isConnected===false||link.closest?.('[hidden],[inert],[aria-hidden="true"]')||!scroller.contains(link))return false;const rect=link.getBoundingClientRect(),clip=scroller.getBoundingClientRect(),viewport=navigationViewportBounds(win);return rect.bottom>clip.top&&rect.top<clip.bottom&&rect.right>clip.left&&rect.left<clip.right&&rect.bottom>viewport.top&&rect.top<viewport.bottom&&rect.right>viewport.left&&rect.left<viewport.right;}
  function showTooltip(link){
    if(disposed||suspended||expanded()||!tooltip||dismissedLink===link||!exposedLink(link))return;hideTooltip();tooltipLink=link;
    const label=link.querySelector('.site-nav-label');tooltip.textContent=label?.dataset?.[language()]||label?.textContent||link.getAttribute('aria-label')||'';if(!tooltip.textContent)return;
    const viewport=navigationViewportBounds(win);tooltip.style.maxWidth=Math.max(24,viewport.width-16)+'px';tooltip.hidden=false;tooltip.style.left='0px';tooltip.style.top='0px';const rect=link.getBoundingClientRect(),tip=tooltip.getBoundingClientRect(),width=tip.width||160,height=tip.height||40;
    let left=rect.right+10,top=rect.top+(rect.bottom-rect.top-height)/2,placement='right';
    if(axis==='horizontal'){left=rect.left+(rect.right-rect.left-width)/2;top=rect.bottom+10;placement='bottom';if(top+height>viewport.bottom-8){top=rect.top-height-10;placement='top';}}
    else if(left+width>viewport.right-8){left=rect.left-width-10;placement='left';}
    tooltip.dataset.placement=placement;tooltip.style.left=Math.max(viewport.left+8,Math.min(viewport.right-width-8,left))+'px';tooltip.style.top=Math.max(viewport.top+8,Math.min(viewport.bottom-height-8,top))+'px';
    const ids=new Set((link.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(tooltip.id);link.setAttribute('aria-describedby',[...ids].join(' '));
    tooltipAnimation=animate(tooltip,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:160});
  }
  function delayTooltipHide(event){if(tooltipLink&&focusedLink()===tooltipLink||tooltip?.contains?.(event?.relatedTarget)||tooltipLink?.contains?.(event?.relatedTarget))return;if(tipTimer!==null)win.clearTimeout(tipTimer);tipTimer=win.setTimeout(()=>{hideTooltip();restoreFocusedTooltip();},220);}
  function focusedLink(){const link=doc.activeElement?.closest?.('a[data-navigation-item]');return link&&scroller.contains(link)?link:null;}
  function restoreFocusedTooltip(){const link=focusedLink();if(!link||expanded()||dismissedLink===link)return;if(tipTimer!==null)win.clearTimeout(tipTimer);tipTimer=win.setTimeout(()=>{tipTimer=null;if(focusedLink()===link)showTooltip(link);},80);}
  function dismissTooltip(){dismissedLink=focusedLink()||tooltipLink;hideTooltip();}
  function setExpanded(value,{persist=true,motion=true}={}){
    if(disposed||suspended)return;
    value=Boolean(value);if(value===expanded()){schedule();return;}cancelAnimations();hideTooltip();
    const targets=[...scroller.querySelectorAll('a[data-navigation-item]')].filter(visible).map(link=>link.querySelector('.nav-icon')).filter(Boolean);
    for(const selector of ['.home-main','.page-main']){const node=doc.querySelector?.(selector);if(node)targets.push(node);}
    const before=new Map(targets.map(node=>[node,node.getBoundingClientRect()]));doc.documentElement.dataset.navigationExpanded=String(value);
    if(persist)try{win.localStorage?.setItem(SITE_NAVIGATION_STORAGE_KEY,value?'1':'0');}catch{/* Appearance still works without persistence. */}
    schedule();if(motion&&!reduce())transitionFrame=requestFrame(()=>{transitionFrame=null;if(disposed||suspended||reduce())return;for(const [node,old]of before){const after=node.getBoundingClientRect(),x=old.left-after.left,y=old.top-after.top;if(Math.abs(x)+Math.abs(y)>1)animate(node,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}]);}if(value)for(const [index,label]of [...scroller.querySelectorAll('.site-nav-label')].filter(label=>exposedLink(label.closest('a[data-navigation-item]'))).slice(0,6).entries())animate(label,[{opacity:0,transform:'translateX(-6px)'},{opacity:1,transform:'translateX(0)'}],{duration:240,delay:index*20});});
  }
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
    const text=SITE_NAVIGATION_COPY[language()],rect=nav.getBoundingClientRect(),computed=style(nav),computedTop=parseFloat(computed.top)||0;
    const viewport=navigationViewportBounds(win),bottom=viewport.bottom;
    const height=Math.max(144,Math.floor((bottom||768)-Math.max(rect.top,computedTop)-16))+'px';
    if(lastHeight!==height){nav.style.setProperty('--site-nav-available-height',height);lastHeight=height;}
    axis=String(style(scroller).flexDirection||'column').startsWith('row')?'horizontal':'vertical';
    const fixedBottom=axis==='horizontal'&&computed.position==='fixed';
    if(fixedBottom){
      const clearance=Math.ceil((number(rect.height)||Math.max(0,rect.bottom-rect.top))+Math.max(0,parseFloat(computed.bottom)||0)+16)+'px';
      if(lastBottomSpace!==clearance){doc.documentElement.style?.setProperty?.('--site-nav-bottom-space',clearance);lastBottomSpace=clearance;}
    }else if(lastBottomSpace){doc.documentElement.style?.removeProperty?.('--site-nav-bottom-space');lastBottomSpace='';}
    const editing=doc.activeElement,tag=editing?.tagName?.toLowerCase(),inputType=String(editing?.type||'text').toLowerCase();
    const editor=Boolean(editing&&!nav.contains(editing)&&!editing.disabled&&!editing.readOnly&&(editing.isContentEditable===true||editing.getAttribute?.('contenteditable')==='true'||tag==='textarea'||tag==='input'&&!['button','submit','reset','checkbox','radio','file','range','color'].includes(inputType)));
    const keyboardOpen=fixedBottom&&editor&&Boolean(win.visualViewport)&&number(win.innerHeight)-viewport.bottom>140;
    if(nav.dataset.keyboardOpen!==String(keyboardOpen))nav.dataset.keyboardOpen=String(keyboardOpen);
    if(keyboardOpen)hideTooltip();
    if(nav.dataset.navAxis!==axis)nav.dataset.navAxis=axis;
    scroller.setAttribute('aria-label',text.menu);
    if(toggle){const key=expanded()?'collapse':'expand';toggle.setAttribute('aria-expanded',String(expanded()));toggle.setAttribute('aria-label',text[key]);const label=toggle.querySelector('.site-nav-toggle-label');if(label){label.textContent=text[key];label.dataset.th=SITE_NAVIGATION_COPY.th[key];label.dataset.en=SITE_NAVIGATION_COPY.en[key];}}
    for(const [button,key]of [[previous,'previous'],[next,'next']]){
      button.setAttribute('aria-label',text[key]);const label=button.querySelector('.site-nav-control-label');if(label)label.textContent=text[key];
    }
    const focus=pendingFocus&&focusedLink()===pendingFocus?pendingFocus:null;pendingFocus=null;
    if(focus)reveal(focus);
    else if(pendingCurrent&&visible(currentLink())){pendingCurrent=false;reveal(currentLink());}
    const state=navigationScrollState(scroller,axis);showControl(previous,state.previous);showControl(next,state.next);
    const overflow=String(state.extent>2);if(nav.dataset.navOverflow!==overflow)nav.dataset.navOverflow=overflow;
    if(focus&&!expanded()){if(tipFrame!==null)cancelFrame(tipFrame);tipFrame=requestFrame(()=>{tipFrame=null;if(focusedLink()===focus)showTooltip(focus);});}
  }
  function schedule(){if(disposed||suspended||frame!==null)return;frame=requestFrame(update);}
  function move(direction){
    if(disposed||suspended)return;const size=navigationScrollState(scroller,axis).size;
    scrollBy(direction*Math.max(48,Math.floor(size*.75)),reduce()?'auto':'smooth');schedule();
  }
  const onPrevious=()=>move(-1),onNext=()=>move(1);
  const onFocus=event=>{const link=event.target?.closest?.('a[data-navigation-item]');if(link&&scroller.contains(link)){dismissedLink=null;pendingFocus=link;schedule();}};
  const onKey=event=>{if(event.key==='Escape'){dismissTooltip();return;}if(event.target!==scroller||event.altKey||event.ctrlKey||event.metaKey||!['PageDown','PageUp'].includes(event.key))return;event.preventDefault();move(event.key==='PageDown'?1:-1);};
  const onScroll=()=>{hideTooltip(false);schedule();restoreFocusedTooltip();},onResize=()=>{hideTooltip();schedule();restoreFocusedTooltip();};
  const onPreferences=()=>{if(reduce())cancelAnimations();hideTooltip();schedule();};
  const onStorage=event=>{if(event.key===SITE_NAVIGATION_STORAGE_KEY||event.key===null)setExpanded(event.newValue==='1',{persist:false});};
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
        if(changed){if(tooltipLink&&!visible(tooltipLink))hideTooltip();schedule();}
      });
      mutationObserver.observe(scroller,{subtree:true,attributes:true,attributeFilter:['hidden','aria-current']});
    }
    listen(scroller,'scroll',onScroll,{passive:true});listen(scroller,'focusin',onFocus);listen(scroller,'focusout',event=>{if(!scroller.contains(event.relatedTarget))hideTooltip();});listen(scroller,'keydown',onKey);listen(previous,'click',onPrevious);listen(next,'click',onNext);listen(toggle,'click',()=>setExpanded(!expanded()));
    for(const link of scroller.querySelectorAll('a[data-navigation-item]')){listen(link,'pointerenter',event=>{if(event.pointerType!=='touch'){dismissedLink=null;showTooltip(link);}});listen(link,'pointerleave',delayTooltipHide);listen(link,'click',()=>hideTooltip());}
    listen(tooltip,'pointerenter',()=>{if(tipTimer!==null)win.clearTimeout(tipTimer);tipTimer=null;});listen(tooltip,'pointerleave',delayTooltipHide);listen(doc,'keydown',event=>{if(event.key==='Escape')dismissTooltip();});
    listen(doc,'focusin',schedule);listen(doc,'focusout',schedule);
    listen(win,'resize',onResize,{passive:true});listen(win,'scroll',onScroll,{passive:true});listen(win,'orientationchange',onResize,{passive:true});listen(win,'taithai:preferences',onPreferences);listen(win,'storage',onStorage);
    listen(win.visualViewport,'resize',onResize,{passive:true});listen(win.visualViewport,'scroll',onScroll,{passive:true});listen(motionQuery,'change',onPreferences);
    if(typeof win.MutationObserver==='function'){rootObserver=new win.MutationObserver(()=>{if(currentGeneration!==generation)return;if(reduce())cancelAnimations();if(expanded())hideTooltip();schedule();});rootObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['data-motion','data-navigation-expanded']});}
    pendingCurrent=true;schedule();
  }
  function disconnect(){suspended=true;generation++;if(frame!==null)cancelFrame(frame);frame=null;hideTooltip();cancelAnimations();resizeObserver?.disconnect();mutationObserver?.disconnect();rootObserver?.disconnect();resizeObserver=mutationObserver=rootObserver=null;for(const remove of listeners.splice(0))remove();pendingFocus=null;}
  const onHide=()=>disconnect(),onShow=event=>{if(event.persisted&&!disposed&&suspended)connect();};
  win.addEventListener('pagehide',onHide);win.addEventListener('pageshow',onShow);connect();
  return {refresh:schedule,setExpanded,destroy(){disposed=true;disconnect();doc.documentElement.style?.removeProperty?.('--site-nav-bottom-space');tooltip?.remove?.();win.removeEventListener('pagehide',onHide);win.removeEventListener('pageshow',onShow);delete nav.dataset.navigationInitialized;}};
}
export function initSiteNavigation({window:win=globalThis.window,document:doc=win?.document}={}){
  if(!win||!doc)return null;const controls=[...doc.querySelectorAll('[data-site-navigation]')].map(nav=>createNavigationController({nav,window:win,document:doc})).filter(Boolean);
  return {refresh(){for(const control of controls)control.refresh();},destroy(){for(const control of controls)control.destroy();}};
}
if(typeof window!=='undefined')initSiteNavigation();
