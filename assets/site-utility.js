/* Compact shared exits for every Taithai tool. No analytics or data collection here. */
(() => {
  if (document.querySelector('[data-site-utility]')) return;
  const labels = {
    th: {name:'เมนู Taithai Apps',home:'แอปทั้งหมด',settings:'ตั้งค่าเว็บไซต์',movieSettings:'ตั้งค่า Movie Memory',account:'บัญชี',help:'ช่วยเหลือ',membership:'สมาชิก',mail:'อีเมล',support:'แจ้งปัญหา',offline:'ขณะนี้ออฟไลน์ เครื่องมือที่ต้องเชื่อมต่ออินเทอร์เน็ตอาจใช้งานไม่ได้ กรุณาเชื่อมต่อก่อนส่งข้อมูล'},
    en: {name:'Taithai Apps navigation',home:'All apps',settings:'Site settings',movieSettings:'Movie Memory settings',account:'Account',help:'Help',membership:'Membership',mail:'Mail',support:'Report a problem',offline:'You are offline. Tools that need the internet may be unavailable. Reconnect before sending data.'}
  };
  function language() {
    try { return (document.documentElement.lang || window.TaithaiPreferences?.get?.().language || localStorage.getItem('taithaiLang')) === 'th' ? 'th' : 'en'; }
    catch { return document.documentElement.lang === 'th' ? 'th' : 'en'; }
  }
  const nav = document.createElement('nav');
  nav.className = 'site-utility'; nav.dataset.siteUtility = '';
  const links = document.createElement('div'); links.className = 'site-utility__links';
  const routeItems = [['home','/'],['settings','/settings/'],['account','/account/'],['help','/help/'],['membership','/membership/'],['mail','/mail/'],['support','/support/']];
  if (document.body.classList.contains('taithai-movie')) routeItems.push(['movieSettings','/Movie-Memory/settings/']);
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
    support: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    membership: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
    movieSettings: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>'
  };
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
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.classList.add('site-utility__icon'); icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('width','18'); icon.setAttribute('height','18'); icon.setAttribute('stroke-width','1.5');
    icon.setAttribute('fill','none'); icon.setAttribute('stroke','currentColor');
    icon.setAttribute('stroke-linecap','round'); icon.setAttribute('stroke-linejoin','round');
    icon.setAttribute('aria-hidden','true'); icon.setAttribute('focusable','false');
    icon.innerHTML = icons[key];
    const label = document.createElement('span'); label.className = 'site-utility__label';
    a.append(icon,label);
    const current = location.pathname.replace(/\/+$/, '') || '/';
    if ((path.replace(/\/+$/, '') || '/') === current) a.setAttribute('aria-current','page');
    links.append(a);
  }
  const offline = document.createElement('p'); offline.className = 'site-utility__offline'; offline.setAttribute('role','status'); offline.hidden = navigator.onLine !== false;
  nav.append(links,offline);
  function render() {
    const t = labels[language()]; nav.setAttribute('aria-label',t.name);
    nav.querySelectorAll('[data-utility-label]').forEach(a => a.querySelector('.site-utility__label').textContent = t[a.dataset.utilityLabel]);
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
