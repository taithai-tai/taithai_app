/* Shared search for public apps and explicitly published social profiles.
   Craft informed by Unslop, Damir Sokolovsky / @heydamir (CC BY 4.0). */
import { getPublicApps } from './site-app-catalog.js';

export const SOCIAL_SEARCH_ENDPOINT = 'https://taithai-app.netlify.app/api/social/';
const COPY = {
  th: {label:'ค้นหาแอปและบัญชี',placeholder:'ค้นหาแอป หรือ @ชื่อผู้ใช้',clear:'ล้างคำค้นหา',apps:'แอป',accounts:'บัญชีสาธารณะ',hint:'ค้นหาบัญชีจากชื่อหรือ @ชื่อผู้ใช้ อย่างน้อย 2 ตัวอักษร',empty:'ไม่พบผลลัพธ์ ลองใช้ชื่ออื่น',loading:'กำลังค้นหาบัญชี…',appLoading:'กำลังโหลดรายการแอป…',appFailed:'โหลดรายการแอปไม่สำเร็จ',accountFailed:'ค้นหาบัญชีไม่สำเร็จ ลองอีกครั้งได้',retry:'ลองอีกครั้ง',community:'เปิดชุมชน',results:n=>`${n} ผลลัพธ์`,publicOnly:'แสดงเฉพาะแอปที่เปิดให้ค้นหาและโปรไฟล์สาธารณะ'},
  en: {label:'Search apps and accounts',placeholder:'Search apps or @username',clear:'Clear search',apps:'Apps',accounts:'Public accounts',hint:'Find accounts by name or @username using at least 2 characters.',empty:'No results. Try another name.',loading:'Finding accounts…',appLoading:'Loading apps…',appFailed:'The app list could not load.',accountFailed:'Account search could not load. You can retry.',retry:'Try again',community:'Open community',results:n=>`${n} results`,publicOnly:'Only discoverable apps and published public profiles are shown.'}
};
export function normalizeSearchTerm(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase().slice(0,80) : '';
}
export function filterSearchApps(settings, value) {
  const term=normalizeSearchTerm(value);
  if (!term || term.startsWith('@') || settings?.valid !== true) return [];
  return getPublicApps(settings).filter(app=>[app.id,app.name.th,app.name.en,...app.aliases].some(text=>normalizeSearchTerm(text).includes(term))).slice(0,8);
}
export function publicSearchProfiles(value) {
  const rows=Array.isArray(value?.items)?value.items:[];
  return [...new Map(rows.filter(item=>typeof item?.uid==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(item.uid)
    && typeof item.handle==='string' && /^[a-z0-9._]{3,24}$/.test(item.handle) && typeof item.displayName==='string' && item.displayName.length<=80)
    .map(item=>[item.uid,{uid:item.uid,handle:item.handle,displayName:item.displayName}])).values()].slice(0,8);
}

/** The caller owns cancellation and discards account-switched responses. No cookies cross origins. */
export async function searchPublicAccounts({query,user,signal,request=globalThis.fetch,endpoint=SOCIAL_SEARCH_ENDPOINT}={}) {
  const q=normalizeSearchTerm(query).replace(/^@/,'');
  if ([...q].length<2 || q.length>48) return [];
  const token=user?.emailVerified===true && typeof user.getIdToken==='function' ? await user.getIdToken() : null;
  if (signal?.aborted) throw Object.assign(Error('ABORTED'),{name:'AbortError'});
  const parameters=new URLSearchParams({action:'search',q,limit:'8'});
  const response=await request(endpoint+'?'+parameters,{cache:'no-store',credentials:'omit',signal,headers:token?{Authorization:'Bearer '+token}:{}});
  if (!response.ok) throw Error('SEARCH_UNAVAILABLE');
  return publicSearchProfiles(await response.json());
}

let nextInstance=0;
export function initSiteSearch({window:win=globalThis.window,document:doc=win?.document,host,
  loadData=()=>import('./site-data.js'),loadAuth=()=>import('/firebase-auth.js?v=20260725-2'),request=win?.fetch?.bind(win) || globalThis.fetch,
  endpoint=SOCIAL_SEARCH_ENDPOINT,debounceMs=250,timeoutMs=20000,now=()=>Date.now()}={}) {
  if (!win || !doc) return null;
  host ||= doc.querySelector('.site-header-inner') || doc.querySelector('header .header-inner');
  if (!host || host.querySelector?.('[data-site-search]')) return null;
  const serial=++nextInstance,id='siteSearch'+serial;
  const el=(tag,text,className)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const form=el('form',undefined,'site-search');form.dataset.siteSearch='true';form.setAttribute('role','search');
  const label=el('label',undefined,'site-search-label');label.htmlFor=id;
  const icon=doc.createElementNS?doc.createElementNS('http://www.w3.org/2000/svg','svg'):el('svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('class','site-search-icon');
  const circle=doc.createElementNS?doc.createElementNS('http://www.w3.org/2000/svg','circle'):el('circle');circle.setAttribute('cx','10.5');circle.setAttribute('cy','10.5');circle.setAttribute('r','6.5');
  const path=doc.createElementNS?doc.createElementNS('http://www.w3.org/2000/svg','path'):el('path');path.setAttribute('d','m16 16 4.5 4.5');icon.append(circle,path);
  const input=el('input');input.id=id;input.type='search';input.value='';input.maxLength=80;input.autocomplete='off';input.spellcheck=false;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',id+'List');
  const clear=el('button','×','site-search-clear');clear.type='button';clear.hidden=true;
  const popup=el('div',undefined,'site-search-popup');popup.hidden=true;
  const list=el('div',undefined,'site-search-results');list.id=id+'List';list.setAttribute('role','listbox');
  const notice=el('p',undefined,'site-search-status');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const retry=el('button',undefined,'site-search-retry');retry.type='button';retry.hidden=true;
  const footer=el('a',undefined,'site-search-community');footer.href='https://taithai.app/community/';
  const privacy=el('p',undefined,'site-search-privacy');
  popup.append(list,notice,retry,privacy,footer);form.append(label,icon,input,clear,popup);
  const tools=host.querySelector?.('.header-tools,.header-actions');if(tools&&host.insertBefore)host.insertBefore(form,tools);else host.append(form);
  let settings=null,settingsAt=0,settingsJob=null,appFailed=false,appLoading=false,people=[],peopleFailed=false,peopleLoading=false;
  let open=false,composing=false,disposed=false,suspended=false,generation=0,policyGeneration=0,authGeneration=0,active=-1,options=[],renderedQuery='',timer=null,controller=null,timeout=null,user=null,unsubscribe=()=>{};
  const language=()=>win.TaithaiPreferences?.get?.().language==='th' || !win.TaithaiPreferences && doc.documentElement.lang==='th'?'th':'en';
  const t=()=>COPY[language()];
  const schedule=(fn,ms)=>(win.setTimeout || setTimeout)(fn,ms);
  const cancelTimer=value=>(win.clearTimeout || clearTimeout)(value);
  function cancel(){generation++;if(timer!==null)cancelTimer(timer);timer=null;controller?.abort();controller=null;if(timeout!==null)cancelTimer(timeout);timeout=null;peopleLoading=false;}
  function close(){open=false;popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function setActive(index){active=options.length?(index+options.length)%options.length:-1;options.forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView?.({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function render(){
    if(disposed)return;const text=t(),query=normalizeSearchTerm(input.value),activeHref=query===renderedQuery?options[active]?.href:null;renderedQuery=query;label.textContent=text.label;input.placeholder=text.placeholder;form.setAttribute('aria-label',text.label);list.setAttribute('aria-label',text.label);clear.setAttribute('aria-label',text.clear);clear.hidden=!query;footer.textContent=text.community;privacy.textContent=text.publicOnly;retry.textContent=text.retry;
    list.replaceChildren();options=[];active=-1;input.removeAttribute('aria-activedescendant');
    if(!query){close();return;}
    const apps=filterSearchApps(settings,query);
    function group(name,rows,kind){if(!rows.length)return;const block=el('div',undefined,'site-search-group');block.setAttribute('role','group');block.setAttribute('aria-label',name);const title=el('p',name,'site-search-group-label');title.setAttribute('aria-hidden','true');block.append(title);for(const row of rows){const option=el('a',undefined,'site-search-option');option.id=id+'Option'+options.length;option.tabIndex=-1;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.href=kind==='app'?'https://taithai.app'+row.href:'https://taithai.app/profile/?'+new URLSearchParams({uid:row.uid});
      const mark=el('span',kind==='app'?'t.':(row.displayName || row.handle).trim().slice(0,1).toUpperCase(),'site-search-avatar');mark.setAttribute('aria-hidden','true');const words=el('span',undefined,'site-search-words');words.append(el('span',kind==='app'?row.name[language()]:row.displayName || row.handle,'site-search-name'),el('span',kind==='app'?row.name[language()==='th'?'en':'th']:'@'+row.handle,'site-search-meta'));option.append(mark,words);const index=options.length;option.addEventListener('pointermove',()=>setActive(index));option.addEventListener('click',()=>close());options.push(option);block.append(option);}list.append(block);}
    group(text.apps,apps,'app');group(text.accounts,people,'account');
    if(activeHref){const index=options.findIndex(node=>node.href===activeHref);if(index>=0)setActive(index);}
    const messages=[];
    if(appLoading)messages.push(text.appLoading);else if(appFailed)messages.push(text.appFailed);
    if(peopleLoading)messages.push(text.loading);else if(peopleFailed)messages.push(text.accountFailed);
    if([...query.replace(/^@/,'')].length<2)messages.push(text.hint);
    else if(!options.length&&!appLoading&&!peopleLoading&&!appFailed&&!peopleFailed)messages.push(text.empty);
    if(options.length&&!messages.length)messages.push(text.results(options.length));
    notice.textContent=messages.join(' ');notice.hidden=!messages.length;retry.hidden=!appFailed&&!peopleFailed;
    popup.hidden=!open;input.setAttribute('aria-expanded',String(open));
  }
  async function loadPolicy(force=false){
    if(settingsJob&&!force)return settingsJob;if(!force&&settings&&now()-settingsAt<30000)return;
    const current=++policyGeneration;settings=null;appLoading=true;appFailed=false;render();
    const job=(async()=>{try{const source=await loadData(),value=await source.getAppVisibilitySettings();if(disposed||suspended||current!==policyGeneration)return;if(value?.valid!==true)throw Error('INVALID_POLICY');settings=value;settingsAt=now();}catch{if(!disposed&&!suspended&&current===policyGeneration){settings=null;appFailed=true;}}finally{if(!disposed&&current===policyGeneration){appLoading=false;settingsJob=null;render();}}})();settingsJob=job;return job;
  }
  async function lookup(current,query,account){
    controller=new AbortController();const pending=controller;timeout=schedule(()=>pending.abort(),timeoutMs);peopleLoading=true;render();
    try{const rows=await searchPublicAccounts({query,user:account,signal:pending.signal,request,endpoint});if(!disposed&&!suspended&&current===generation&&user?.uid===account?.uid)people=rows;}
    catch(error){if(!disposed&&!suspended&&current===generation){people=[];peopleFailed=true;}}
    finally{if(current===generation){if(timeout!==null)cancelTimer(timeout);timeout=null;controller=null;peopleLoading=false;render();}}
  }
  function search(immediate=false){
    if(disposed||suspended||composing)return;cancel();people=[];peopleFailed=false;const query=normalizeSearchTerm(input.value);open=Boolean(query);render();if(!query)return;
    void loadPolicy();const accountQuery=query.replace(/^@/,'');if([...accountQuery].length<2 || accountQuery.length>48)return;
    peopleLoading=true;render();const current=generation,account=user;timer=schedule(()=>{timer=null;void lookup(current,query,account);},immediate?0:debounceMs);
  }
  function navigate(){if(!options.length)return;const destination=options[active>=0?active:0].href;close();win.location.assign(destination);}
  const onInput=()=>search();const onFocus=()=>{if(input.value)search();};
  const onKey=event=>{if(composing||event.isComposing)return;if(event.key==='Escape'){if(open){event.preventDefault();cancel();close();}}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open&&input.value){open=true;render();}setActive(active<0?(event.key==='ArrowDown'?0:options.length-1):active+(event.key==='ArrowDown'?1:-1));}else if(event.key==='Enter'){event.preventDefault();navigate();}};
  const onSubmit=event=>{event.preventDefault();if(!composing)navigate();};
  const onOutside=event=>{if(!form.contains(event.target)){cancel();close();}};
  const onFocusOut=()=>schedule(()=>{if(!disposed&&!form.contains(doc.activeElement)){cancel();close();}},0);
  const onPreferences=()=>render();const onCompositionStart=()=>{composing=true;cancel();};const onCompositionEnd=()=>{composing=false;search();};
  const onShortcut=event=>{if((event.metaKey||event.ctrlKey)&&!event.altKey&&event.key?.toLowerCase()==='k'){event.preventDefault();input.focus();input.select?.();}};
  const onWindowFocus=()=>{settings=null;settingsAt=0;if(open)search(true);};
  function attachAuth(){const current=++authGeneration;Promise.resolve().then(loadAuth).then(auth=>{if(disposed||suspended||current!==authGeneration)return;unsubscribe=auth.subscribeAuth(value=>{if(disposed||suspended||current!==authGeneration)return;const changed=(user?.uid||'')!==(value?.uid||'');user=value || null;if(changed){cancel();people=[];if(open)search(true);else render();}});}).catch(()=>{});}
  function suspend(){suspended=true;cancel();policyGeneration++;authGeneration++;settings=null;settingsAt=0;settingsJob=null;appLoading=false;people=[];unsubscribe();unsubscribe=()=>{};user=null;input.value='';close();render();}
  function restore(event){if(event.persisted&&!disposed){suspended=false;attachAuth();}}
  clear.addEventListener('click',()=>{input.value='';cancel();people=[];render();input.focus();});retry.addEventListener('click',()=>{settings=null;settingsAt=0;search(true);});input.addEventListener('input',onInput);input.addEventListener('focus',onFocus);input.addEventListener('keydown',onKey);input.addEventListener('compositionstart',onCompositionStart);input.addEventListener('compositionend',onCompositionEnd);form.addEventListener('submit',onSubmit);form.addEventListener('focusout',onFocusOut);doc.addEventListener('pointerdown',onOutside);doc.addEventListener('keydown',onShortcut);win.addEventListener('taithai:preferences',onPreferences);win.addEventListener('focus',onWindowFocus);win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',restore);
  render();attachAuth();
  return {input,form,popup,reload:()=>{settings=null;settingsAt=0;search(true);},destroy(){disposed=true;suspend();input.removeEventListener('input',onInput);input.removeEventListener('focus',onFocus);input.removeEventListener('keydown',onKey);input.removeEventListener('compositionstart',onCompositionStart);input.removeEventListener('compositionend',onCompositionEnd);form.removeEventListener('submit',onSubmit);form.removeEventListener('focusout',onFocusOut);doc.removeEventListener('pointerdown',onOutside);doc.removeEventListener('keydown',onShortcut);win.removeEventListener('taithai:preferences',onPreferences);win.removeEventListener('focus',onWindowFocus);win.removeEventListener('pagehide',suspend);win.removeEventListener('pageshow',restore);form.remove();}};
}
if(typeof window!=='undefined')initSiteSearch();
