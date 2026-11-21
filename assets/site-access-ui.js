import { ADMIN_API_ORIGIN, createSiteAdminApi, verifiedAccount } from './site-admin-api.js';

/** Delegated links stay hidden until a fresh server response confirms each capability. */
export function initAccessUI({win=globalThis.window,doc=win?.document,loadAuth=()=>import('/firebase-auth.js?v=20260725-2'),request,endpoint=ADMIN_API_ORIGIN+'/api/site-admin/'}={}) {
  if (!win || !doc || !doc.querySelector('[data-mail-access],[data-dashboard-access],[data-admin-access]') || doc.body.dataset.accessUiInitialized) return null;
  doc.body.dataset.accessUiInitialized='true';
  let user=null,generation=0,disposed=false,unsubscribe=()=>{};
  const api=createSiteAdminApi({getUser:()=>user,window:win,request,endpoint});
  function show(access={}) {
    for (const [selector,flag] of [['[data-mail-access]','mailAccess'],['[data-dashboard-access]','dashboardAccess'],['[data-admin-access]','adminAccess']]) doc.querySelectorAll(selector).forEach(node=>{node.hidden=access[flag]!==true;});
  }
  function suspend(){generation++;api.abort();unsubscribe();unsubscribe=()=>{};user=null;show();}
  async function check(){const current=++generation;api.abort();show();if (!verifiedAccount(user)) return;try {const access=await api.getAccess();if (!disposed && current===generation) show(access);}catch {if (!disposed && current===generation) show();}}
  async function start(){suspend();const current=generation;try {const auth=await loadAuth();if (disposed || current!==generation)return;unsubscribe=auth.subscribeAuth(value=>{user=value;void check();});}catch {show();}}
  const restore=event=>{if(event.persisted && !disposed)void start();};
  const focus=()=>{if(!disposed)void check();};
  win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',restore);win.addEventListener('focus',focus);void start();
  return {destroy(){disposed=true;suspend();win.removeEventListener('pagehide',suspend);win.removeEventListener('pageshow',restore);win.removeEventListener('focus',focus);delete doc.body.dataset.accessUiInitialized;}};
}
if (typeof window!=='undefined') initAccessUI();
