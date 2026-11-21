/* Admin data goes through the authenticated server, never browser Firestore grants. */
export const ADMIN_API_ORIGIN = 'https://taithai-app.netlify.app';
export const verifiedAccount = user => Boolean(user?.uid && user.emailVerified === true);
export function normalizeAdminAccess(value) {
  const adminAccess = value?.adminAccess === true;
  return {adminAccess,ownerAccess:adminAccess && value.ownerAccess === true,
    dashboardAccess:adminAccess && value.dashboardAccess === true,mailAccess:adminAccess && value.mailAccess === true,
    canManageAdmins:adminAccess && value.canManageAdmins === true,canManageReports:adminAccess && value.canManageReports === true,
    canManageApps:adminAccess && value.canManageApps === true,role:adminAccess ? value.role === 'owner' ? 'owner' : 'admin' : 'user',
    permissions:Array.isArray(value?.permissions) ? value.permissions.filter(item => ['dashboard','mail','reports_manage','apps_manage'].includes(item)) : []};
}
export function createSiteAdminApi({getUser,window:win=globalThis.window,request=win?.fetch?.bind(win) || globalThis.fetch,endpoint='/api/site-admin/',onAccessDenied}={}) {
  const controllers = new Set();
  async function call(action,{method='GET',data,params={}}={}) {
    const user=getUser?.();if (!verifiedAccount(user)) throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});
    const uid=user.uid,controller=new AbortController();controllers.add(controller);
    const timer=(win?.setTimeout || setTimeout)(()=>controller.abort(),method==='GET'?25000:55000);
    const same=()=>verifiedAccount(getUser?.()) && getUser().uid===uid;
    try {
      const token=await user.getIdToken();if (!same()) throw Object.assign(Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'});
      const query=new URLSearchParams({action,...Object.fromEntries(Object.entries(params).filter(([,value])=>value!==undefined && value!==null && value!==''))});
      const result=await request(endpoint+'?'+query,{method,cache:'no-store',credentials:'omit',signal:controller.signal,
        headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(data || {})}:{})});
      const body=await result.json().catch(()=>({}));if (!same()) throw Object.assign(Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'});
      if (!result.ok || body.ok===false) {const code=body.error?.code || body.code || (result.status===403?'ADMIN_PERMISSION_REQUIRED':'SERVICE_UNAVAILABLE');if(action!=='access' && [401,403].includes(result.status))onAccessDenied?.();throw Object.assign(Error(code),{code,status:result.status,deliveryUnknown:method==='POST' && result.status>=500});}
      return body;
    } catch (error) {
      if (error?.name==='AbortError') throw Object.assign(Error(method==='POST'?'site/timeout-uncertain':'REQUEST_TIMEOUT'),{code:method==='POST'?'site/timeout-uncertain':'REQUEST_TIMEOUT',deliveryUnknown:method==='POST'});
      if (method==='POST' && !error?.status && !['ACCOUNT_CHANGED','AUTH_REQUIRED'].includes(error?.code)) error.deliveryUnknown=true;
      throw error;
    } finally {(win?.clearTimeout || clearTimeout)(timer);controllers.delete(controller);}
  }
  const ids = new Map();
  function write(action,data) {
    data=JSON.parse(JSON.stringify(data));
    const key=JSON.stringify([getUser?.()?.uid,action,data]);if (!ids.has(key)) ids.set(key,win?.crypto?.randomUUID?.() || globalThis.crypto.randomUUID());
    return call(action,{method:'POST',data:{...data,requestId:ids.get(key)}}).then(result=>{ids.delete(key);return result;},error=>{if (!error.deliveryUnknown) ids.delete(key);throw error;});
  }
  return {call,abort(){for (const controller of controllers) controller.abort();controllers.clear();},
    getAccess:async()=>normalizeAdminAccess(await call('access')),
    listEvents:params=>call('events',{params}),listReports:params=>call('reports',{params}),getReport:id=>call('report',{params:{id}}),
    updateReport:(id,changes,expectedUpdatedAt)=>write('report-update',{id,changes,...(expectedUpdatedAt?{expectedUpdatedAt}:{})}).catch(error=>{if (error.code==='REPORT_CONFLICT') error.code='site/conflict';throw error;}),
    getAppVisibilitySettings:()=>call('app-settings'),updateAppVisibilitySettings:data=>write('app-settings-update',data).catch(error=>{if (error.code==='APP_SETTINGS_CONFLICT') error.code='site/conflict';throw error;})};
}
