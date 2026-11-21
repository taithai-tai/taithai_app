/* Compact shared exits for every Taithai tool. No analytics or data collection here. */
(() => {
  if (document.querySelector('[data-site-utility]')) return;
  const labels = {
    th: {name:'เมนู Taithai Apps',home:'แอปทั้งหมด',settings:'ตั้งค่าเว็บไซต์',movieSettings:'ตั้งค่า Movie Memory',account:'บัญชี',help:'ช่วยเหลือ',support:'แจ้งปัญหา',offline:'ขณะนี้ออฟไลน์ เครื่องมือที่ต้องเชื่อมต่ออินเทอร์เน็ตอาจใช้งานไม่ได้ กรุณาเชื่อมต่อก่อนส่งข้อมูล'},
    en: {name:'Taithai Apps navigation',home:'All apps',settings:'Site settings',movieSettings:'Movie Memory settings',account:'Account',help:'Help',support:'Report a problem',offline:'You are offline. Tools that need the internet may be unavailable. Reconnect before sending data.'}
  };
  function language() {
    try { return (document.documentElement.lang || window.TaithaiPreferences?.get?.().language || localStorage.getItem('taithaiLang')) === 'th' ? 'th' : 'en'; }
    catch { return document.documentElement.lang === 'th' ? 'th' : 'en'; }
  }
  const nav = document.createElement('nav');
  nav.className = 'site-utility'; nav.dataset.siteUtility = '';
  const links = document.createElement('div'); links.className = 'site-utility__links';
  const routeItems = [['home','/'],['settings','/settings/'],['account','/account/'],['help','/help/'],['support','/support/']];
  if (document.body.classList.contains('taithai-movie')) routeItems.push(['movieSettings','/Movie-Memory/settings/']);
  const appRoutes = [
    ['/temporary chat','Temporary Chat'], ['/QR Code Generator ','QR Code Generator'],
    ['/QR Code Reader','QR Code Reader'], ['/S','URL Shortener'], ['/URL Shortener','URL Shortener'],
    ['/Bangkok Doctor Plan','BU Degree Plan Explorer'], ['/Movie Memory','Movie Memory'],
    ['/Movie-Memory','Movie Memory'], ['/Public Drive','Public Drive'], ['/Private Drive','Private Drive'],
    ['/Chordly','Chordly'], ['/ACE','ACE']
  ];
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(location.pathname); } catch {}
  const app = appRoutes.find(([base]) => decodedPath === base || decodedPath.startsWith(base + '/'))?.[1];
  for (const [key,path] of routeItems) {
    const a = document.createElement('a'); a.href = key === 'support' && app ? `${path}?app=${encodeURIComponent(app)}` : path; a.dataset.utilityLabel = key;
    const current = location.pathname.replace(/\/+$/, '') || '/';
    if ((path.replace(/\/+$/, '') || '/') === current) a.setAttribute('aria-current','page');
    links.append(a);
  }
  const offline = document.createElement('p'); offline.className = 'site-utility__offline'; offline.setAttribute('role','status'); offline.hidden = navigator.onLine !== false;
  nav.append(links,offline);
  function render() {
    const t = labels[language()]; nav.setAttribute('aria-label',t.name);
    nav.querySelectorAll('[data-utility-label]').forEach(a => a.textContent = t[a.dataset.utilityLabel]);
    offline.textContent = t.offline;
  }
  function measureChat() {
    if (document.body.classList.contains('tt-chat')) document.body.style.setProperty('--tt-utility-height',`${nav.getBoundingClientRect().height}px`);
  }
  function updateConnection() { offline.hidden = navigator.onLine !== false; measureChat(); }
  if (document.body.classList.contains('tt-chat')) document.body.prepend(nav); else document.body.append(nav);
  render(); measureChat();
  window.addEventListener('online', updateConnection); window.addEventListener('offline',updateConnection);
  window.addEventListener('resize',measureChat);
  window.addEventListener('storage',() => {render();measureChat();});
  window.addEventListener('taithai:preferences',() => {render();measureChat();});
  // Existing language buttons update html.lang independently in a few tools.
  new MutationObserver(() => {render();measureChat();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
