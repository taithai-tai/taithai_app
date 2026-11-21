/* One navigation catalog for the public portal, account tools and community.
   Permission markers are consumed by site-access-ui; this catalog grants none. */
export const SITE_NAVIGATION_ORIGIN='https://taithai.app';
export const SITE_NAVIGATION_STORAGE_KEY='taithai.navigation.expanded.v1';
export const SITE_NAVIGATION_ITEMS=Object.freeze([
  {id:'home',path:'/',th:'หน้าแรก',en:'Home',icon:'<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>'},
  {id:'mail',path:'/mail/',th:'อีเมล',en:'Mail',access:'mail',icon:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>'},
  {id:'community',path:'/community/',th:'ชุมชน',en:'Community',icon:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 8h10M7 12h10M7 16h6"/>'},
  {id:'profile',path:'/profile/',th:'โปรไฟล์',en:'Profile',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'},
  {id:'messages',path:'/messages/',th:'ข้อความ',en:'Messages',icon:'<path d="M21 11a8 8 0 0 1-12 7l-6 3 2-6A8 8 0 1 1 21 11zM8 10h8M8 14h5"/>'},
  {id:'account',path:'/account/',th:'บัญชี',en:'Account',icon:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M5.5 16a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3"/>'},
  {id:'settings',path:'/settings/',th:'ตั้งค่า',en:'Settings',icon:'<circle cx="12" cy="12" r="4"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>'},
  {id:'admin',path:'/admin/',th:'หลังบ้าน',en:'Dashboard',access:'dashboard',icon:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-4M12 16V7M17 16v-6"/>'},
  {id:'help',path:'/help/',th:'ช่วยเหลือ',en:'Help',icon:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01"/>'},
  {id:'support',path:'/support/',th:'แจ้งปัญหา',en:'Support',icon:'<path d="M21 11a8 8 0 0 1-12 7l-6 3 2-6A8 8 0 1 1 21 11zM12 7v5M12 15h.01"/>'},
  {id:'privacy',path:'/privacy/',th:'ความเป็นส่วนตัว',en:'Privacy',icon:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>'},
  {id:'about',path:'/about/',th:'เกี่ยวกับ',en:'About',icon:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'}
].map(item=>Object.freeze(item)));
export const SITE_NAVIGATION_COPY=Object.freeze({
  th:Object.freeze({menu:'เมนูหลัก',previous:'เลื่อนเมนูก่อนหน้า',next:'เลื่อนเมนูถัดไป',expand:'ขยายเมนู',collapse:'ย่อเมนู'}),
  en:Object.freeze({menu:'Main navigation',previous:'Previous navigation items',next:'Next navigation items',expand:'Expand menu',collapse:'Collapse menu'})
});
