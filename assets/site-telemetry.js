/* Opt-in product analytics. Never collects field values, page queries, file contents or chat text. */
const CONSENT_KEY = 'taithai.analytics-consent.v1';
let consent = null, active = false, dataClient = null, loading = null, queue = [], timer = null, heartbeat = null, lastActivity = Date.now(), lastBeat = Date.now(), authUnsubscribe = null, initialAuth = true, consentEpoch = 0, wasVisible = !document.hidden;
try { const saved = JSON.parse(localStorage.getItem(CONSENT_KEY)); if (saved?.version === 1 && ['granted','denied'].includes(saved.choice)) consent = saved.choice; } catch {}
const language = () => window.TaithaiPreferences?.get().language === 'th' ? 'th' : 'en';
const copy = (th,en) => language() === 'th' ? th : en;
const routes = [
  ['/temporary chat','Temporary Chat'],['/QR Code Generator ','QR Code Generator'],['/QR Code Reader','QR Code Reader'],['/S','URL Shortener'],['/URL Shortener','URL Shortener'],['/Bangkok Doctor Plan','BU Degree Plan Explorer'],['/Movie Memory','Movie Memory'],['/Movie-Memory','Movie Memory'],['/Public Drive','Public Drive'],['/Private Drive','Private Drive'],['/Chordly','Chordly'],['/ACE','ACE']
];
export function telemetryContext(pathname = location.pathname) {
  let path; try { path = decodeURIComponent(pathname); } catch { path = '/unknown/'; }
  const match = routes.find(([base]) => path === base || path.startsWith(base + '/'));
  if (match) {
    let part = path.slice(match[0].length).split('/').filter(Boolean)[0] || '';
    if (!['settings','account','help','search','lookup','song','game','dashboard','recommendations','install','tutorial','profile','movie','add','review','posters','rewatch','services','privacy','pricing','demo','contact','about','how-it-works'].includes(part)) part = '';
    return {app:match[1],path:match[0].replaceAll(' ','-') + (part ? '/' + part : '') + '/'};
  }
  const first = path.split('/').filter(Boolean)[0] || '';
  return {app:'Taithai website',path:['settings','account','help','support','privacy','about'].includes(first) ? '/' + first + '/' : first === '' ? '/' : '/other/'};
}
function load() {
  if (!loading) loading = import('./site-data.js').then(module => { dataClient = module; return module; }).catch(error => { loading = null; throw error; });
  return loading;
}
function track(name, detail = {}) {
  if (!active || consent !== 'granted' || location.pathname.startsWith('/admin')) return;
  queue.push({name,...telemetryContext(),action:typeof detail.action === 'string' ? detail.action.slice(0,80) : '',durationSeconds:Number.isInteger(detail.durationSeconds) ? Math.min(60,Math.max(0,detail.durationSeconds)) : 0});
  if (queue.length > 40) queue.shift();
  if (!timer) timer = setTimeout(flush, 1200);
}
async function flush() {
  clearTimeout(timer); timer = null;
  if (!active || consent !== 'granted' || !queue.length || navigator.onLine === false) return;
  const batch = queue.splice(0,20); const epoch = consentEpoch;
  try { const api = await load(); if (active && consent === 'granted' && consentEpoch === epoch) await api.trackEvents(batch); }
  catch { /* No replay of private data or unbounded network retries. Tracking is best effort. */ }
  if (queue.length && active) timer = setTimeout(flush, 2000);
}
function handleClick(event) {
  if (!active || !event.isTrusted) return;
  lastActivity = Date.now();
  const target = event.target.closest('button,a,[data-track]'); if (!target || target.closest('#siteAnalyticsConsent,[data-private],#reportForm,#accountProfileForm,#adminPanel')) return;
  // Identifiers come from developer-defined IDs, never visible text or input values.
  let action = target.dataset.track || target.id || '';
  if (!/^[a-zA-Z][a-zA-Z0-9:_-]{0,79}$/.test(action)) action = target.tagName.toLowerCase();
  if (target.tagName === 'A') {
    try { const url = new URL(target.href,location.origin); if (url.origin === location.origin) { const dest = telemetryContext(url.pathname); if (dest.app !== 'Taithai website' && dest.app !== telemetryContext().app) { track('app_open',{action:dest.app}); return; } action = 'navigate:' + dest.path; } else { action = 'external-link'; } } catch {}
  }
  track('click',{action});
}
function beat(force = false) {
  const now = Date.now(), seconds = Math.min(60,Math.max(0,Math.round((now-lastBeat)/1000))); lastBeat=now;
  if (seconds > 0 && (force || !document.hidden) && now-lastActivity < 90000) track('heartbeat',{durationSeconds:seconds,action:'active'});
}
function begin() {
  if (active || consent !== 'granted' || location.pathname.startsWith('/admin')) return;
  active = true; wasVisible = !document.hidden; const epoch = consentEpoch; lastActivity = Date.now(); lastBeat = Date.now(); track('page_view'); if (location.pathname.startsWith('/help')) track('help_view');
  document.addEventListener('click',handleClick,true); document.addEventListener('pointerdown',activity,{passive:true}); document.addEventListener('keydown',activity,{passive:true}); heartbeat=setInterval(beat,60000);
  import('/firebase-auth.js?v=20260725-2').then(api => { if (!active || epoch !== consentEpoch) return; authUnsubscribe = api.subscribeAuth(user => { if (!active || epoch !== consentEpoch) return; if (!initialAuth) track(user ? 'signin' : 'signout'); initialAuth=false; }); }).catch(()=>{});
}
function activity() { lastActivity=Date.now(); }
function stop() {
  active=false; queue=[]; clearTimeout(timer); timer=null; clearInterval(heartbeat); heartbeat=null;
  document.removeEventListener('click',handleClick,true); document.removeEventListener('pointerdown',activity); document.removeEventListener('keydown',activity); authUnsubscribe?.(); authUnsubscribe=null; initialAuth=true;
}
function setConsent(choice) {
  if (!['granted','denied'].includes(choice)) return;
  if (consent !== choice) { consentEpoch++; stop(); }
  consent=choice; try { localStorage.setItem(CONSENT_KEY,JSON.stringify({version:1,choice,updatedAt:new Date().toISOString()})); } catch {}
  if (choice==='granted') begin(); else stop();
  renderConsent(); window.dispatchEvent(new CustomEvent('taithai:consent',{detail:{choice}}));
}
let banner;
function renderConsent() {
  banner?.remove(); banner=null;
  if (consent || location.pathname.startsWith('/admin')) return;
  banner=document.createElement('section'); banner.id='siteAnalyticsConsent'; banner.className='site-consent'; banner.setAttribute('aria-label',copy('ตัวเลือกสถิติการใช้งาน','Usage analytics choice'));
  const title=document.createElement('strong'); title.textContent=copy('ช่วยให้เครื่องมือดีขึ้น ในแบบที่คุณเลือก','Help improve the tools, on your terms');
  const p=document.createElement('p'); p.textContent=copy('อนุญาตให้เจ้าของเว็บดูหน้าที่เปิด ปุ่มที่กด และเวลาใช้งานได้ไหม? หากล็อกอินจะเชื่อมกับชื่อและอีเมลของคุณด้วย ไม่เก็บข้อความที่พิมพ์หรือเนื้อหาไฟล์','Allow the owner to see pages, control clicks and active time? When signed in, events include your name and email. Form values and file contents are excluded.');
  const actions=document.createElement('div'); actions.className='button-row';
  for (const [choice,th,en] of [['denied','ไม่อนุญาต','Decline'],['granted','อนุญาตสถิติ','Allow analytics']]) { const button=document.createElement('button'); button.type='button'; button.className='button button-secondary'; button.textContent=copy(th,en); button.addEventListener('click',()=>setConsent(choice)); actions.append(button); }
  const a=document.createElement('a'); a.href='/privacy/'; a.textContent=copy('ข้อมูลที่เก็บและวิธีเปลี่ยนใจ','What is collected and how to change your choice');
  banner.append(title,p,actions,a); document.body.append(banner);
}
window.TaithaiAnalytics=Object.freeze({getConsent:()=>consent,setConsent,track});
window.addEventListener('taithai:preferences',event=>{ renderConsent(); if (event.detail?.source==='set') track('preference_change',{action:'website-preferences'}); });
window.addEventListener('storage',event=>{ if(event.key!==CONSENT_KEY) return;consentEpoch++;stop(); try { const saved=JSON.parse(event.newValue); consent=saved?.version===1&&['granted','denied'].includes(saved.choice)?saved.choice:null; } catch {consent=null;} if(consent==='granted')begin();else stop();renderConsent();window.dispatchEvent(new CustomEvent('taithai:consent',{detail:{choice:consent}})); });
window.addEventListener('online',flush); document.addEventListener('visibilitychange',()=>{ if(document.hidden){if(wasVisible)beat(true);wasVisible=false;flush();}else {wasVisible=true;lastBeat=Date.now();lastActivity=Date.now();} });
window.addEventListener('pagehide',()=>{if(wasVisible)beat(true);wasVisible=false;flush();});
renderConsent(); begin(); window.dispatchEvent(new CustomEvent('taithai:analytics-ready'));
